import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hmgsAlanlari } from '../_alan/hmgs-alanlari.ts';
import { kartDurumu, kartUuid, kaynakKaydi, oyunlar } from '../_alan/kart.ts';
import { alanOzetleri, denemeHavuzu, desteBul, gorunenKartlar, tumDesteler } from './desteler.ts';

const icerikKlasoru = fileURLToPath(new URL('../../../../../../content/desteler/', import.meta.url));
const EM_DASH = String.fromCharCode(0x2014);
const yasakIfadeler = readFileSync(
  fileURLToPath(new URL('../../../../../../content/yasak-ifadeler.txt', import.meta.url)),
  'utf8',
);

describe('deck files', () => {
  it('lists every JSON file of content/desteler (a new deck must be added to _veri/desteler.ts)', () => {
    const dosyalar = readdirSync(icerikKlasoru)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect(tumDesteler.map((d) => d.slug).sort()).toEqual(dosyalar);
  });

  it('is valid under the card schema (the import would already have thrown otherwise)', () => {
    expect(tumDesteler.length).toBeGreaterThan(0);
    for (const d of tumDesteler) expect(d.kartlar.length, d.slug).toBeGreaterThan(0);
  });

  it('keeps each HMGS deck on its own area and uses each area once', () => {
    const alanlar = tumDesteler.map((d) => d.hmgsAlani).filter((a) => a !== null);
    expect(new Set(alanlar).size).toBe(alanlar.length);
    for (const d of tumDesteler) expect(d.slug).toBe(d.hmgsAlani);
    for (const a of alanlar) expect(hmgsAlanlari.map((x) => x.slug)).toContain(a);
  });

  it('has no long dash and no banned phrase in any deck file', () => {
    const yasak = yasakIfadeler
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
    for (const f of readdirSync(icerikKlasoru).filter((f) => f.endsWith('.json'))) {
      const metin = readFileSync(icerikKlasoru + f, 'utf8');
      expect(metin.includes(EM_DASH), f).toBe(false);
      for (const y of yasak)
        expect(metin.toLocaleLowerCase('tr-TR').includes(y.toLocaleLowerCase('tr-TR')), `${f}: ${y}`).toBe(
          false,
        );
    }
  });
});

describe('card content rules (plan 10.6/4)', () => {
  const kartlar = tumDesteler.flatMap((d) => d.kartlar.map((k) => ({ d, k })));

  it('binds every card to a primary source with a verification date and a quotation', () => {
    for (const { k } of kartlar) {
      expect(k.kaynaklar.length, k.id).toBeGreaterThan(0);
      for (const s of k.kaynaklar) {
        expect(s.dogrulamaTarihi, `${k.id} not verified`).not.toBeNull();
        expect(s.maddeOzeti, k.id).not.toBeNull();
        expect(s.alintilar.length, k.id).toBeGreaterThan(0);
        expect(['mevzuat.gov.tr', 'anayasa.gov.tr']).toContain(s.kaynak);
        expect(s.url.startsWith('https://'), k.id).toBe(true);
      }
      expect(k.kaynakKayitIdleri, k.id).toEqual([...new Set(k.kaynaklar.map(kaynakKaydi))].sort());
    }
  });

  it('publishes nothing that two editors have not approved: HMGS cards need two different editors', () => {
    for (const { d, k } of kartlar) {
      const durum = kartDurumu(k, d.hmgsAlani !== null);
      const gecerli = k.editorler.filter((e) => e.surum === k.surum);
      if (durum === 'yayinda') {
        expect(
          new Set(gecerli.map((e) => e.ad.toLocaleLowerCase('tr-TR'))).size,
          k.id,
        ).toBeGreaterThanOrEqual(d.hmgsAlani ? 2 : 1);
        expect(
          gecerli.every((e) => e.ad !== k.hazirlayan),
          k.id,
        ).toBe(true);
      }
    }
  });

  it('serves no card to a learner while no editor has approved it, and cards for preview only in preview mode', () => {
    for (const d of tumDesteler) {
      const yayinda = d.kartlar.filter((k) => kartDurumu(k, true) === 'yayinda').length;
      expect(gorunenKartlar(d, false)).toHaveLength(yayinda);
      expect(gorunenKartlar(d, true).length).toBeGreaterThanOrEqual(yayinda);
    }
    expect(denemeHavuzu(false).length).toBe(
      tumDesteler.flatMap((d) => d.kartlar).filter((k) => kartDurumu(k, true) === 'yayinda').length,
    );
  });

  it('answers every card with an explanation and a quotation that supports the answer text', () => {
    for (const { k } of kartlar) {
      expect(k.aciklama.length, k.id).toBeGreaterThan(30);
      expect(k.dogruIndex, k.id).toBeLessThan(k.secenekler.length);
    }
  });

  it('covers all four games', () => {
    const kullanilan = new Set(kartlar.map(({ k }) => k.oyun));
    for (const o of oyunlar) expect(kullanilan.has(o), o).toBe(true);
  });

  it('has unique card ids and unique deterministic UUIDs', () => {
    const idler = kartlar.map(({ k }) => k.id);
    expect(new Set(idler).size).toBe(idler.length);
    expect(new Set(idler.map(kartUuid)).size).toBe(idler.length);
  });

  it('has a spread of correct answer positions in the multiple choice cards, not always the same slot', () => {
    const cok = kartlar.filter(({ k }) => k.secenekler.length >= 4);
    const konumlar = new Set(cok.map(({ k }) => k.dogruIndex));
    expect(konumlar.size).toBeGreaterThanOrEqual(3);
  });

  it('does not copy OSYM questions: no card carries an OSYM marker or a question booklet reference', () => {
    for (const { k } of kartlar) {
      const metin = JSON.stringify([k.soru, k.secenekler, k.aciklama]).toLocaleLowerCase('tr-TR');
      expect(metin, k.id).not.toMatch(/ösym|osym|soru kitapçığı|çıkmış soru/);
    }
  });
});

describe('area summary for the HMGS page', () => {
  it('lists all 20 areas, with a deck where one exists and the counts of visible and waiting cards', () => {
    const o = alanOzetleri(false);
    expect(o).toHaveLength(20);
    const medeni = o.find((x) => x.alan.slug === 'medeni-hukuk');
    expect(medeni?.deste?.slug).toBe('medeni-hukuk');
    expect(medeni?.gorunen).toBe(0);
    expect(medeni?.onayBekleyen).toBe(desteBul('medeni-hukuk')?.kartlar.length);
    expect(o.find((x) => x.alan.slug === 'borclar-hukuku')?.deste).toBeNull();
    expect(alanOzetleri(true).find((x) => x.alan.slug === 'medeni-hukuk')?.gorunen).toBe(
      medeni?.onayBekleyen,
    );
  });
});
