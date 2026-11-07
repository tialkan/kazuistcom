import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { maddeler } from '../tespit/_veri/ayristir.ts';
import { kuralSeti } from '../tespit/_veri/kurallar.ts';
import { acikModuller, modulAcik } from '../(kabuk)/_kabuk/rotalar.ts';
import { bosDepo, depoyuOku, isaretle, sayi, yuzde, depoAnahtari } from './_alan/ilerleme.ts';
import { ichBaglantilar, tezSchema } from './_alan/sema.ts';
import { etik, gecerliIdler, kontrol, makale, tez, zoteroEndnote } from './_veri/rehberler.ts';

const yol = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const icerikKlasoru = yol('../../../../../content/rehberler/');
const dosyalar = readdirSync(icerikKlasoru).filter((f) => f.endsWith('.json'));
const ham = (f: string) => readFileSync(icerikKlasoru + f, 'utf8');
const yasak = readFileSync(yol('../../../../../content/yasak-ifadeler.txt'), 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('#'));

describe('content files', () => {
  it('lists every JSON file of content/rehberler in _veri/rehberler.ts', () => {
    expect(dosyalar.sort()).toEqual([
      'etik.json',
      'kontrol-listesi.json',
      'makale.json',
      'tez.json',
      'zotero-endnote.json',
    ]);
    const kaynak = readFileSync(yol('./_veri/rehberler.ts'), 'utf8');
    for (const f of dosyalar) expect(kaynak).toContain(`content/rehberler/${f}`);
  });

  it('has the counts of SRS FR-32..37: 12 + 12 steps, 8 + 6 tool steps, 14 items, 6 violations', () => {
    expect(makale.adimlar).toHaveLength(12);
    expect(tez.adimlar).toHaveLength(12);
    expect(zoteroEndnote.zotero.adimlar).toHaveLength(8);
    expect(zoteroEndnote.endnote.adimlar).toHaveLength(6);
    expect(kontrol.maddeler).toHaveLength(14);
    expect(etik.ihlaller.map((i) => i.id)).toEqual([
      'intihal',
      'sahtecilik',
      'carpitma',
      'tekrar-yayim',
      'dilimleme',
      'haksiz-yazarlik',
    ]);
  });

  it('has no em dash, no en dash, no banned phrase and no emoji (CLAUDE.md metin kurallari)', () => {
    const uzun = String.fromCharCode(0x2014);
    const orta = String.fromCharCode(0x2013);
    for (const f of dosyalar) {
      const t = ham(f);
      expect(t.includes(uzun), `${f} em dash`).toBe(false);
      expect(t.includes(orta), `${f} en dash`).toBe(false);
      const kucuk = t.toLocaleLowerCase('tr-TR');
      for (const ifade of yasak)
        expect(kucuk.includes(ifade.toLocaleLowerCase('tr-TR')), `${f}: ${ifade}`).toBe(false);
      expect(/\p{Extended_Pictographic}/u.test(t), `${f} emoji`).toBe(false);
    }
  });

  it('uses only https links and only known internal routes', () => {
    for (const f of dosyalar) {
      for (const [, u] of ham(f).matchAll(/"url":\s*"([^"]+)"/g)) expect(u).toMatch(/^https:\/\//);
      for (const [, h] of ham(f).matchAll(/"href":\s*"([^"]+)"/g)) expect(ichBaglantilar).toContain(h);
    }
  });

  it('gives every source a read date and keeps the Zotero and EndNote pages tied to official hosts', () => {
    for (const k of zoteroEndnote.kaynaklar) {
      expect(k.okuma).toBe('2026-11-07');
      expect(new URL(k.url).host).toMatch(
        /^(www\.zotero\.org|endnote\.com|docs\.endnote\.com|raw\.githubusercontent\.com)$/,
      );
    }
  });

  it('writes the six violations word for word from the directive (m. 4/1) and links the PDF', () => {
    const tanim = (id: string) => etik.ihlaller.find((i) => i.id === id)?.tanim ?? '';
    expect(tanim('intihal')).toContain(
      'bilimsel kurallara uygun biçimde atıf yapmadan kısmen veya tamamen kendi eseri gibi göstermek',
    );
    expect(tanim('sahtecilik')).toBe(
      'Bilimsel araştırmalarda gerçekte var olmayan veya tahrif edilmiş verileri kullanmak.',
    );
    expect(tanim('tekrar-yayim')).toBe(
      'Mükerrer yayınlarını akademik atama ve yükselmelerde ayrı yayınlar olarak sunmak.',
    );
    expect(tanim('haksiz-yazarlik')).toContain('nüfuzunu kullanarak ismini yazarlar arasına dâhil ettirmek');
    expect(etik.ihlaller.map((i) => i.fikra)).toEqual([
      'm. 4/1 (a)',
      'm. 4/1 (b)',
      'm. 4/1 (c)',
      'm. 4/1 (ç)',
      'm. 4/1 (d)',
      'm. 4/1 (e)',
    ]);
    expect(etik.kaynak.url).toBe('https://www.yok.gov.tr/documents/documents/68fb63b8b2511.pdf');
    expect(etik.ornekNotu).toMatch(/Gerçek bir/);
  });

  it('ties every thesis step to a listed source and says how each source was verified', () => {
    for (const a of tez.adimlar) {
      expect(tez.kaynaklar.map((k) => k.id)).toContain(a.dayanak);
      expect(a.dayanakNotu).toBeTruthy();
    }
    expect(tez.kaynaklar.map((k) => k.id).sort()).toEqual([
      'dunleavy',
      'edinburgh',
      'hutchinson',
      'silvia',
      'volokh',
    ]);
    for (const k of tez.kaynaklar) expect(['birincil', 'ikincil']).toContain(k.dogrulama);
    // a book that was not read is never marked primary
    for (const id of ['volokh', 'dunleavy', 'silvia', 'hutchinson'])
      expect(tez.kaynaklar.find((k) => k.id === id)?.dogrulama).toBe('ikincil');
  });

  it('rejects a thesis step with an unknown source', () => {
    const bozuk = structuredClone(tez);
    const ilk = bozuk.adimlar[0];
    if (!ilk) throw new Error('no step');
    ilk.dayanak = 'yok';
    expect(tezSchema.safeParse(bozuk).success).toBe(false);
  });

  it('points checklist rules at rules that exist in docs/tespit/yazim-kurallari.md', () => {
    const idler = new Set(maddeler(kuralSeti).map((m) => m.id));
    for (const m of kontrol.maddeler) if (m.kural) expect(idler.has(m.kural), m.kural).toBe(true);
  });

  it('labels the checklist with the two SRS labels', () => {
    expect(new Set(kontrol.maddeler.map((m) => m.etiket))).toEqual(new Set(['makale-ve-tez', 'yalniz-tez']));
  });
});

describe('guide progress (FR-34), stored apart for article, thesis and checklist', () => {
  const g = gecerliIdler;
  it('marks and unmarks in content order and ignores unknown ids', () => {
    let d = bosDepo();
    d = isaretle(d, 'makale', 'm03', true, g.makale);
    d = isaretle(d, 'makale', 'm01', true, g.makale);
    expect(d.makale).toEqual(['m01', 'm03']);
    d = isaretle(d, 'makale', 'x99', true, g.makale);
    expect(d.makale).toEqual(['m01', 'm03']);
    d = isaretle(d, 'makale', 'm01', false, g.makale);
    expect(d.makale).toEqual(['m03']);
    expect(d.tez).toEqual([]);
    expect(sayi(d, 'makale')).toBe(1);
  });

  it('reads stored text defensively: bad JSON, wrong shape and stale ids give clean progress', () => {
    expect(depoyuOku(null, g)).toEqual(bosDepo());
    expect(depoyuOku('{bozuk', g)).toEqual(bosDepo());
    expect(depoyuOku('{"makale":"m01"}', g)).toEqual(bosDepo());
    const d = depoyuOku(
      JSON.stringify({ makale: ['m01', 'm01', 'eski'], tez: ['t02'], kontrol: ['k14'] }),
      g,
    );
    expect(d).toEqual({ makale: ['m01'], tez: ['t02'], kontrol: ['k14'] });
  });

  it('keeps lists a page does not name, so the article page never erases thesis progress', () => {
    const d = depoyuOku(JSON.stringify({ makale: ['m01'], tez: ['t05', 'eski'] }), { makale: g.makale });
    expect(d.tez).toEqual(['t05', 'eski']);
  });

  it('computes whole percentages', () => {
    expect(yuzde(0, 12)).toBe(0);
    expect(yuzde(1, 12)).toBe(8);
    expect(yuzde(12, 12)).toBe(100);
    expect(yuzde(5, 0)).toBe(0);
    expect(depoAnahtari).toBe('kazuist.rehber.v1');
  });
});

describe('module registration', () => {
  it('opens /rehberler in the shell and leaves the other routes as they were', () => {
    expect(modulAcik('/rehberler')).toBe(true);
    expect(acikModuller.has('/pratik')).toBe(true);
  });
});
