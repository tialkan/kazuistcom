import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kabuk } from './Kabuk.tsx';
import { moduller } from './rotalar.ts';
import {
  ertelenenKokler,
  ertelenenModuller,
  gizliModuller,
  gorunenModuller,
  modulGorunur,
  uretimMi,
  yolGizli,
} from './yayin.ts';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
// The Hedefim slot is an async server component that reads the session; the shell links are what is tested here.
vi.mock('./Hedefim.tsx', () => ({ Hedefim: () => null }));
afterEach(() => vi.unstubAllEnvs());

const uretim = { NODE_ENV: 'production', KAZUIST_ENV: 'production' };

describe('launch module set (yayin.ts)', () => {
  it('hides Pratik, Kalemcik and Atıf ağı in production and keeps the narrowed core', () => {
    expect([...gizliModuller(uretim)].sort()).toEqual(['atif-agi', 'kalemcik', 'pratik']);
    expect(gorunenModuller(uretim).map((m) => m.href)).toEqual([
      '/ara',
      '/rehberler',
      '/yazma',
      '/kaydettiklerim',
    ]);
    for (const yol of ['/pratik', '/pratik/hmgs/deneme', '/kalemcik', '/atif-agi'])
      expect(yolGizli(yol, uretim)).toBe(true);
    for (const yol of [
      '/',
      '/ara',
      '/yazma/sablon',
      '/rehberler/tez',
      '/tespit',
      '/kaydettiklerim',
      '/pratikler',
    ])
      expect(yolGizli(yol, uretim), yol).toBe(false);
  });

  it('fails closed: a production build hides the modules even without KAZUIST_ENV or with a typo', () => {
    for (const env of [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'staging' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'Production' },
    ]) {
      expect(uretimMi(env)).toBe(true);
      expect(gizliModuller(env).size).toBe(3);
    }
  });

  it('shows every module in development, in tests and in a production build marked development', () => {
    for (const env of [
      {},
      { NODE_ENV: 'development' },
      { NODE_ENV: 'test', KAZUIST_ENV: 'production' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'development' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'test' },
    ]) {
      expect(uretimMi(env)).toBe(false);
      expect(gizliModuller(env).size).toBe(0);
      expect(gorunenModuller(env)).toEqual(moduller);
      for (const m of ertelenenModuller) expect(modulGorunur(m, env)).toBe(true);
    }
  });

  it('opens deferred modules in production only through KAZUIST_MODULLER', () => {
    expect(modulGorunur('pratik', { ...uretim, KAZUIST_MODULLER: 'pratik' })).toBe(true);
    expect(modulGorunur('atif-agi', { ...uretim, KAZUIST_MODULLER: 'pratik' })).toBe(false);
    expect(gizliModuller({ ...uretim, KAZUIST_MODULLER: ' pratik , atif-agi ' })).toEqual(
      new Set(['kalemcik']),
    );
    expect(gizliModuller({ ...uretim, KAZUIST_MODULLER: 'hepsi' }).size).toBe(0);
    expect(gizliModuller({ ...uretim, KAZUIST_MODULLER: 'ara,PRATIK,bilinmeyen' }).size).toBe(3);
  });

  it('guards every deferred module root with a layout that calls notFound()', () => {
    const app = fileURLToPath(new URL('../../', import.meta.url));
    for (const m of ertelenenModuller) {
      const dosya = `${app}${ertelenenKokler[m].slice(1)}/layout.tsx`;
      expect(existsSync(dosya), dosya).toBe(true);
      const metin = readFileSync(dosya, 'utf8');
      expect(metin).toContain(`modulGorunur('${m}')`);
      expect(metin).toContain('notFound()');
    }
  });

  it('leaves hidden modules out of the tabs and the footer of the shell in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAZUIST_ENV', 'production');
    const html = renderToStaticMarkup(<Kabuk oturum={null}>x</Kabuk>);
    for (const kok of Object.values(ertelenenKokler)) expect(html, kok).not.toContain(`href="${kok}"`);
    for (const kok of ['/ara', '/yazma', '/rehberler', '/kaydettiklerim', '/tespit'])
      expect(html).toContain(`href="${kok}"`);
  });

  it('lists every tab in the shell outside production', () => {
    vi.stubEnv('KAZUIST_ENV', 'development');
    const html = renderToStaticMarkup(<Kabuk oturum={null}>x</Kabuk>);
    for (const m of moduller) expect(html).toContain(`href="${m.href}"`);
  });
});
