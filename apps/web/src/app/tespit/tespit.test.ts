import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import tr from '@kazuist/i18n/tr/tespit.json';
import { flattenKeys } from '@kazuist/i18n';
import { Denetleyici } from './_bilesen/Denetleyici.tsx';
import { KopyalaDugmesi } from './_bilesen/KopyalaDugmesi.tsx';
import { doldur, panoyaKopyala } from './_bilesen/kopyala.ts';
import { ayristir, maddeler } from './_veri/ayristir.ts';
import { denetle, kucukTr } from './_veri/denetle.ts';
import { BAGLAC_LISTESI, CUMLE_BASI_BAGLACLARI, KATILIMCI_TERIMLERI, izler } from './_veri/izler.ts';
import { kisalt, kuralKimligi, kuralOzetleri, kuralSeti } from './_veri/kurallar.ts';
import TespitSayfasi from './page.tsx';
import { GET } from './yazim-kurallari.md/route.ts';

const yol = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const md = readFileSync(yol('../../../../../docs/tespit/yazim-kurallari.md'), 'utf8');
const kaynak = (p: string) => readFileSync(yol(p), 'utf8');
const tumMaddeler = maddeler(kuralSeti);
const madde = new Map(tumMaddeler.map((m) => [m.id, kucukTr(m.metin)]));

describe('rule set data matches docs/tespit/yazim-kurallari.md', () => {
  it('has 159 numbered items in 11 sections, version 1.2', () => {
    const numarali = md.split('\n').filter((s) => /^\d+\. /.test(s));
    expect(numarali).toHaveLength(159);
    expect(tumMaddeler).toHaveLength(159);
    expect(kuralSeti.bolumler.map((b) => b.no)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(kuralSeti.surum).toBe('1.2');
  });
  it('is exactly what the parser produces from the Markdown (regenerate with uret.ts when this fails)', () => {
    expect(kuralSeti).toEqual(ayristir(md));
  });
  it('offers the Markdown byte for byte as the prompt', () => {
    expect(kuralSeti.istem).toBe(md);
  });
  it('keeps every item text equal to its line in the Markdown', () => {
    const satirlar = new Set(md.split('\n'));
    for (const m of tumMaddeler) expect(satirlar.has(`${m.kaynakNo}. ${m.metin}`), m.id).toBe(true);
  });
  it('gives every item a unique id and splits section 9 into 9.1 to 9.12', () => {
    const idler = tumMaddeler.map((m) => m.id);
    expect(new Set(idler).size).toBe(159);
    const dokuz = tumMaddeler.filter((m) => m.id.startsWith('9.'));
    expect(dokuz.map((m) => m.id)).toEqual(Array.from({ length: 12 }, (_, i) => `9.${i + 1}`));
    expect(dokuz.map((m) => m.kaynakNo)).toEqual([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]);
    expect(madde.get('9.3')).toContain('yanlış pozitifi vardır');
    expect(madde.get('9.4')).toContain('tek başına güvenilmez');
  });
  it('contains no U+2014 character', () => {
    expect(md.includes(String.fromCharCode(0x2014))).toBe(false);
    expect(JSON.stringify(kuralSeti).includes(String.fromCharCode(0x2014))).toBe(false);
  });
});

describe('the checker catalogue is tied to the rule text', () => {
  it('quotes only literals that appear in the rule it cites', () => {
    for (const iz of izler) {
      expect(madde.has(iz.kural), `rule ${iz.kural} exists`).toBe(true);
      if (iz.terim) {
        expect(madde.get(iz.kural), `${iz.kural}: "${iz.terim}"`).toContain(kucukTr(iz.terim));
      }
    }
  });
  it('detects its own sample for every entry', () => {
    for (const iz of izler) {
      const bulgular = denetle(iz.ornek).bulgular;
      expect(
        bulgular.some((b) => b.kural === iz.kural),
        `${iz.kural}: ${JSON.stringify(iz.ornek)}`,
      ).toBe(true);
    }
  });
  it('cites only existing rules from the sentence and paragraph level checks', () => {
    for (const id of ['6.25', '6.14', '6.3', '5.19', '4.6', '6.10', '4.9', '7.7', '9.3', '10.4', '10.6']) {
      expect(madde.has(id), id).toBe(true);
    }
  });
  it('uses connectors, openers and person labels that the rules name', () => {
    expect(madde.get('4.6')).toContain('bu çerçevede');
    expect(madde.get('6.14')).toContain('dolayısıyla,');
    for (const k of KATILIMCI_TERIMLERI) expect(madde.get('4.9')).toContain(k);
    for (const b of CUMLE_BASI_BAGLACLARI.filter((x) => x !== 'fakat' && x !== 'ama')) {
      expect(kuralSeti.istem.toLocaleLowerCase('tr-TR')).toContain(b);
    }
    expect(BAGLAC_LISTESI.length).toBeGreaterThanOrEqual(10);
  });
  it('shortens rule labels at a clause or a word boundary', () => {
    expect(kisalt('Kısa kural: ayrıntı')).toBe('Kısa kural');
    expect(kisalt('a '.repeat(120)).endsWith('…')).toBe(true);
    expect(Object.keys(kuralOzetleri)).toHaveLength(159);
  });
});

describe('sample text shows traces from several families without a verdict', () => {
  it('finds certain traces, markers and at least five families', () => {
    const s = denetle(tr.denetleyici.ornek);
    expect(s.say.kesin).toBeGreaterThanOrEqual(3);
    expect(s.say.bilgi).toBe(1);
    expect(Object.keys(s.ailelerSay).length).toBeGreaterThanOrEqual(5);
  });
});

describe('copy button', () => {
  const istem = 'Birinci satır\nİkinci satır ığüşöç';
  it('writes the exact prompt to the clipboard', async () => {
    const yazilan: string[] = [];
    const sonuc = await panoyaKopyala(istem, {
      writeText: (m) => {
        yazilan.push(m);
        return Promise.resolve();
      },
    });
    expect(sonuc).toBe('basarili');
    expect(yazilan).toEqual([istem]);
  });
  it('reports failure when the clipboard is missing, not a function, or rejects', async () => {
    expect(await panoyaKopyala(istem, undefined)).toBe('basarisiz');
    expect(await panoyaKopyala(istem, {})).toBe('basarisiz');
    expect(
      await panoyaKopyala(istem, { writeText: () => Promise.reject(new Error('NotAllowedError')) }),
    ).toBe('basarisiz');
    expect(
      await panoyaKopyala(istem, {
        writeText: () => {
          throw new Error('sync failure');
        },
      }),
    ).toBe('basarisiz');
  });
  it('renders a button, a live region and a download link, and no fallback textarea at first', () => {
    const html = renderToStaticMarkup(
      createElement(KopyalaDugmesi, { istem, indirHref: '/tespit/yazim-kurallari.md' }),
    );
    expect(html).toContain(tr.istem.kopyala);
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/);
    expect(html).toContain('href="/tespit/yazim-kurallari.md"');
    expect(html).toContain('download="kazuist-yazim-kurallari.md"');
    expect(html).not.toContain('<textarea');
  });
  it('explains the fallback in the failure message', () => {
    expect(tr.istem.kopyalanamadi).toContain('Ctrl+C');
    expect(tr.istem.kopyalandi.length).toBeGreaterThan(5);
  });
  it('interpolates dictionary strings', () => {
    expect(doldur('{a} ve {b} ve {c}', { a: 1, b: 'iki' })).toBe('1 ve iki ve {c}');
  });
});

describe('download route', () => {
  it('serves the Markdown with a plain ASCII file name', async () => {
    const res = GET();
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    const ek = res.headers.get('content-disposition') ?? '';
    expect(ek).toBe('attachment; filename="kazuist-yazim-kurallari.md"');
    expect(/^[\x20-\x7e]+$/.test(ek)).toBe(true);
    expect(await res.text()).toBe(md);
  });
});

describe('page', () => {
  const html = renderToString(createElement(TespitSayfasi));
  it('shows the sections, all 159 anchors and the privacy statement', () => {
    expect(html).toContain(`<h1>${tr.baslik}</h1>`);
    for (const b of kuralSeti.bolumler) expect(html).toContain(`id="bolum-${b.no}"`);
    for (const m of tumMaddeler) expect(html).toContain(`id="${kuralKimligi(m.id)}"`);
    expect(html).toContain(tr.denetleyici.gizlilik.baslik);
    expect(html).toContain('hiçbir sunucuya');
  });
  it('presents the result as trace count and density with the false positive warning, never a verdict', () => {
    expect(html).toContain(tr.denetleyici.uyari.baslik);
    expect(html).toContain('Yanlış pozitifler olur');
    const arayuz = JSON.stringify(tr.denetleyici);
    expect(arayuz).not.toMatch(/%\s?\{?\w*\}?\s+(yapay|ai)/i);
    expect(arayuz.toLocaleLowerCase('tr-TR')).not.toContain('yapay zekâ yazdı');
    expect(arayuz.toLocaleLowerCase('tr-TR')).not.toContain('yapay zekâ oranı');
    expect(tr.denetleyici.sonuc.yogunluk).toBe('1000 sözcükte iz');
  });
  it('has no raw HTML injection or hidden form fields in the checker', () => {
    const form = renderToStaticMarkup(createElement(Denetleyici, { kuralOzetleri }));
    expect(form).toMatch(/<form[^>]*>/);
    expect(form).not.toMatch(/<form[^>]*action=/);
    expect(form).not.toMatch(/<textarea[^>]*name=/);
    expect(form).not.toMatch(/<input[^>]*type="hidden"/);
    expect(form).toMatch(/autocomplete="off"/i);
  });
});

describe('the pasted text stays in the browser', () => {
  const dosyalar = [
    './_veri/denetle.ts',
    './_veri/izler.ts',
    './_bilesen/Denetleyici.tsx',
    './_bilesen/kopyala.ts',
  ];
  const yasak = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /sendBeacon/,
    /WebSocket/,
    /EventSource/,
    /localStorage/,
    /sessionStorage/,
    /indexedDB/,
    /document\.cookie/,
    /console\./,
    /['"]use server['"]/,
    /from ['"]next\/(?:server|headers)['"]/,
    /import\s*\(/,
  ];
  it.each(dosyalar)('%s has no network, storage, logging or server code path', (d) => {
    const s = kaynak(d);
    for (const re of yasak) expect(s, `${d} ${re}`).not.toMatch(re);
  });
  it('imports only local modules, React, the design system and the dictionary', () => {
    for (const d of dosyalar) {
      const importlar = [...kaynak(d).matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
      for (const i of importlar) {
        expect(
          i.startsWith('.') ||
            ['react', '@kazuist/ui', '@kazuist/i18n', '@kazuist/i18n/tr/tespit.json'].includes(i),
          `${d}: ${i}`,
        ).toBe(true);
      }
    }
  });
});

describe('dictionary', () => {
  it('has unique, non-empty keys', () => {
    const anahtarlar = flattenKeys(tr);
    expect(anahtarlar.length).toBeGreaterThan(0);
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
  });
  it('has no em dash', () => {
    expect(JSON.stringify(tr).includes(String.fromCharCode(0x2014))).toBe(false);
  });
});
