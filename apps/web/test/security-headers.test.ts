import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, staticSecurityHeaders } from '../src/server/security-headers.ts';

describe('contentSecurityPolicy', () => {
  it('is strict in production', () => {
    const csp = contentSecurityPolicy('abc');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain('unsafe-inline');
  });
  it('allows eval only in development', () => {
    expect(contentSecurityPolicy('x', true)).toContain("'unsafe-eval'");
  });
});

describe('staticSecurityHeaders', () => {
  const keys = (env: Record<string, string>) => staticSecurityHeaders(env).map((h) => h.key);
  it('sends HSTS only in production, without includeSubDomains or preload', () => {
    expect(keys({ NODE_ENV: 'development' })).not.toContain('Strict-Transport-Security');
    const hsts = staticSecurityHeaders({ NODE_ENV: 'production' }).find(
      (h) => h.key === 'Strict-Transport-Security',
    );
    expect(hsts?.value).toBe('max-age=63072000');
  });
  it('always sends nosniff, Referrer-Policy and Permissions-Policy', () => {
    expect(keys({})).toEqual(
      expect.arrayContaining(['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']),
    );
  });
});
