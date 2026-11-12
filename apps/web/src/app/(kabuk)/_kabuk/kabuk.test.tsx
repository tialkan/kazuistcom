import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ortak } from '@kazuist/i18n';
import { HedefimBagi } from './HedefimBagi.tsx';
import { basHarf, hedefimGorunumu } from './oturum.ts';
import { acikModuller, moduller } from './rotalar.ts';

vi.mock('next/navigation', () => ({ usePathname: () => '/yazma/sablonlar' }));

const t = ortak();

describe('Hedefim slot', () => {
  it('sends a guest to /giris with the sign in text', () => {
    const g = hedefimGorunumu(null);
    expect(g).toEqual({
      href: '/giris',
      ust: t.hedefim.etiket,
      alt: t.hedefim.girisYapin,
      bas: null,
      baslik: t.hedefim.girisAciklama,
    });
  });

  it('shows the name and target of a signed in user and links to the account hub', () => {
    const g = hedefimGorunumu({ ad: 'irem Kaya', hedef: 'Avukat', avatar: 'avukat-n' });
    expect(g.href).toBe('/hesap');
    expect(g.ust).toBe('irem Kaya');
    expect(g.alt).toBe('Avukat');
    expect(g.bas).toBe('İ');
    expect(g.baslik).toBe(t.hedefim.hesapAciklama);
  });

  it('opens the target page when no target is chosen and falls back to "Hesabım" without a name', () => {
    const g = hedefimGorunumu({ ad: null, hedef: null, avatar: null });
    expect(g.href).toBe('/hesap/hedef');
    expect(g.ust).toBe(t.gezinme.hesap);
    expect(g.alt).toBe(t.hedefim.secilmedi);
    expect(g.bas).toBeNull();
  });

  it('takes the initial by code point and ignores blank names', () => {
    expect(basHarf('  çağla')).toBe('Ç');
    expect(basHarf('   ')).toBeNull();
    expect(basHarf(null)).toBeNull();
  });

  it('escapes the user supplied name and keeps the visible text in the link name', () => {
    const html = renderToStaticMarkup(
      <HedefimBagi oturum={{ ad: '<b>x</b>', hedef: 'Hakim', avatar: null }} />,
    );
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('href="/hesap"');
    expect(html).toContain('kabuk-hedefim__avatar--oturum');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders the guest link without an initial', () => {
    const html = renderToStaticMarkup(<HedefimBagi oturum={null} />);
    expect(html).toContain('href="/giris"');
    expect(html).toContain(t.hedefim.girisYapin);
    expect(html).not.toContain('kabuk-hedefim__avatar--oturum');
  });
});

describe('module tabs without a "coming soon" state (ADR-0033)', () => {
  it('treats every module as open; there is no separate list', () => {
    expect([...acikModuller]).toEqual(moduller.map((m) => m.href));
  });

  it('links every tab and marks the current section', async () => {
    const { ModulGezinmesi } = await import('./ModulGezinmesi.tsx');
    const html = renderToStaticMarkup(<ModulGezinmesi />);
    for (const m of moduller) expect(html).toContain(`href="${m.href}"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('<a aria-current="page" href="/yazma">');
  });

  it('has no "yakında" key or marker left in the shell', () => {
    expect(Object.keys(t.gezinme)).not.toContain('yakinda');
    const dir = fileURLToPath(new URL('./', import.meta.url));
    for (const f of readdirSync(dir).filter((x) => /\.(tsx?|css)$/.test(x) && !x.endsWith('.test.tsx')))
      expect(readFileSync(dir + f, 'utf8'), f).not.toMatch(/modul-kapali|ModulBagi|yakinda/);
  });
});
