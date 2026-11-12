import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * OpenAPI and the Route Handlers stay in step (contract v1.5, ADR-0035, review.md P1 madde 6). Every path either
 * has a route.ts under apps/web/src/app/api with the same methods, or carries x-kazuist-uygulama: planlandi (a 1.0
 * feature without a handler yet) or kaldirilacak (removed in the next breaking contract, ADR-0036). A marked path
 * that gains a handler must drop the mark, and every handler must be in the contract.
 */

const MARK = 'x-kazuist-uygulama';
const MARKS = ['planlandi', 'kaldirilacak'] as const;
const METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options'] as const;

type PathItem = Partial<Record<(typeof METHODS)[number], unknown>> & { [MARK]?: string };
const spec = parse(readFileSync(fileURLToPath(new URL('../openapi.yaml', import.meta.url)), 'utf8')) as {
  paths: Record<string, PathItem>;
};
const apiRoot = fileURLToPath(new URL('../../../apps/web/src/app/api', import.meta.url));

/** `/v1/x/{id}` and the folder `v1/x/[id]` (or a catch all `[...all]`) both become `/v1/x/*`. */
const fromSpec = (path: string) => path.replace(/\{[^}]+\}/g, '*');
const fromFolder = (dir: string) =>
  `/${relative(apiRoot, dir)
    .split(/[\\/]/)
    .map((seg) => (/^\[.+\]$/.test(seg) ? '*' : seg))
    .join('/')}`;

/** Methods a route.ts exports: `export const GET`, `export async function POST`, `export { GET, POST }`. */
function exportedMethods(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/export\s+(?:const|let|async\s+function|function)\s+([A-Z]+)\b/g))
    if (m[1]) found.add(m[1].toLowerCase());
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of (m[1] ?? '').split(',')) {
      const name =
        part
          .trim()
          .split(/\s+as\s+/)
          .pop() ?? '';
      if (/^[A-Z]+$/.test(name)) found.add(name.toLowerCase());
    }
  return [...found].filter((x) => (METHODS as readonly string[]).includes(x)).sort();
}

function routes(dir: string, out = new Map<string, { file: string; methods: string[] }>()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) routes(full, out);
    else if (entry.name === 'route.ts')
      out.set(fromFolder(dir), {
        file: relative(apiRoot, full),
        methods: exportedMethods(readFileSync(full, 'utf8')),
      });
  }
  return out;
}

const handlers = existsSync(apiRoot)
  ? routes(apiRoot)
  : new Map<string, { file: string; methods: string[] }>();
const paths = Object.entries(spec.paths);
const methodsOf = (item: PathItem) => METHODS.filter((m) => item[m] !== undefined).sort();

describe('OpenAPI paths and Route Handlers', () => {
  it('finds the web app routes', () => expect(handlers.size).toBeGreaterThan(50));

  it('marks carry a known value', () => {
    const bad = paths.filter(([, item]) => item[MARK] !== undefined && !MARKS.includes(item[MARK] as never));
    expect(bad.map(([p]) => p)).toEqual([]);
  });

  it('every path without a handler is marked planlandi or kaldirilacak', () => {
    const missing = paths.filter(([p, item]) => !handlers.has(fromSpec(p)) && item[MARK] === undefined);
    expect(missing.map(([p]) => p)).toEqual([]);
  });

  it('a marked path has no handler (drop the mark when the handler lands)', () => {
    const stale = paths.filter(([p, item]) => item[MARK] !== undefined && handlers.has(fromSpec(p)));
    expect(stale.map(([p]) => p)).toEqual([]);
  });

  it('every handler is in the contract', () => {
    const inSpec = new Set(paths.map(([p]) => fromSpec(p)));
    const extra = [...handlers.entries()].filter(([p]) => !inSpec.has(p)).map(([, r]) => r.file);
    expect(extra).toEqual([]);
  });

  it('a handler exports exactly the methods of its path', () => {
    const diff = paths.flatMap(([p, item]) => {
      const r = handlers.get(fromSpec(p));
      if (!r) return [];
      const want = methodsOf(item);
      return JSON.stringify(want) === JSON.stringify(r.methods) ? [] : [`${p}: ${want} vs ${r.methods}`];
    });
    expect(diff).toEqual([]);
  });

  it('only Kampus paths are marked kaldirilacak (ADR-0031)', () => {
    const removed = paths.filter(([, item]) => item[MARK] === 'kaldirilacak').map(([p]) => p);
    expect(removed.length).toBe(11);
    expect(removed.every((p) => p.startsWith('/v1/kampus/') || p === '/v1/kampus')).toBe(true);
  });
});
