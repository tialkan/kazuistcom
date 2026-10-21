import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ayristir, onBilgi, satirIci } from '../src/app/(kabuk)/_hukuki/md.ts';
import {
  gosterimKipi,
  hukukiMetin,
  hukukiMetinler,
  hukukiMetinSurumu,
  kazuistOrtami,
  oku,
} from '../src/app/(kabuk)/_hukuki/yukle.ts';

describe('legal Markdown subset', () => {
  it('keeps raw HTML as literal text and drops unsafe links', () => {
    const b = ayristir('<script>alert(1)</script> [x](javascript:void) [y](/hukuki/gizlilik)');
    expect(b).toHaveLength(1);
    const p = b[0];
    if (p?.t !== 'paragraf') throw new Error('paragraph expected');
    expect(p.c[0]).toEqual({ t: 'metin', v: '<script>alert(1)</script> x ' });
    expect(p.c[1]).toMatchObject({ t: 'bag', href: '/hukuki/gizlilik' });
  });
  it('parses headings, quotes, lists with continuation lines and tables', () => {
    const b = ayristir(
      '## Başlık\n\n> Not\n\n1. bir\n   devam\n2. iki\n\n- a\n- b\n\n| A | B |\n|---|---|\n| x | **y** |\n',
    );
    expect(b.map((x) => x.t)).toEqual(['baslik', 'alinti', 'liste', 'liste', 'tablo']);
    const ol = b[2];
    if (ol?.t !== 'liste') throw new Error('list expected');
    expect(ol.sirali).toBe(true);
    expect(ol.ogeler[0]).toEqual([{ t: 'metin', v: 'bir devam' }]);
    expect(satirIci('**k** *e* `c`').map((s) => s.t)).toEqual(['kalin', 'metin', 'egik', 'metin', 'kod']);
  });
  it('reads flat front matter with booleans and comments', () => {
    expect(onBilgi('binding: true # c\nslug: uyari\ntitle: "A: b"')).toEqual({
      binding: true,
      slug: 'uyari',
      title: 'A: b',
    });
  });
});

describe('publication gate (ADR-0023)', () => {
  it('treats only NODE_ENV and KAZUIST_ENV both production as production', () => {
    expect(kazuistOrtami({ NODE_ENV: 'production', KAZUIST_ENV: 'production' })).toBe('production');
    expect(kazuistOrtami({ NODE_ENV: 'production', KAZUIST_ENV: 'staging' })).toBe('staging');
    expect(kazuistOrtami({ NODE_ENV: 'production' })).toBe('development');
  });
  it('loads and validates every content/hukuki text', () => {
    const tr = hukukiMetinler('tr');
    const en = hukukiMetinler('en');
    expect(tr.length).toBeGreaterThan(10);
    expect(en.length).toBe(5);
    for (const m of en) expect(m.fm.binding).toBe(false);
  });
  it('hides drafts in production and bands them elsewhere', () => {
    const m = hukukiMetin('tr', 'uyari');
    if (!m) throw new Error('uyari missing');
    expect(m.fm.status).toBe('taslak');
    expect(gosterimKipi(m, 'production')).toBe('gizli');
    expect(gosterimKipi(m, 'staging')).toBe('taslak_bandi');
    expect(gosterimKipi(m, 'development')).toBe('taslak_bandi');
  });
  it('fails the build for a text marked yayinda that still has a placeholder', () => {
    const d = mkdtempSync(join(tmpdir(), 'hukuki-'));
    const f = join(d, 'x.md');
    const fm =
      '---\ntitle: X\nslug: x\nroute: /hukuki/x\nlang: tr\nbinding: true\nversion: 2026-10-19.1\ndate: 2026-10-19\nstatus: yayinda\n---\n';
    writeFileSync(f, `${fm}Metin {{MERSIS}}\n`);
    expect(() => oku(f)).toThrow(/open marker/);
    writeFileSync(f, `${fm}Metin [DOĞRULANACAK: x]\n`);
    expect(() => oku(f)).toThrow(/open marker/);
    writeFileSync(f, `${fm}Metin tamam.\n`);
    expect(gosterimKipi(oku(f), 'production')).toBe('yayin');
  });
  it('exposes the consent version from front matter', () => {
    expect(hukukiMetinSurumu('aydinlatma')).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(hukukiMetinSurumu('yok')).toBeNull();
  });
});
