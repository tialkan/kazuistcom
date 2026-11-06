import { describe, expect, it } from 'vitest';
import { kartDurumu } from '../_alan/kart.ts';
import { tumDesteler } from '../_veri/desteler.ts';
import { desteKartlari, desteListesi, desteUuid, kartDto } from './api.ts';
import { kartGorunumu } from '../_alan/kart.ts';
import { kartYap } from '../_alan/test-verisi.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deck list', () => {
  it('has one entry per deck with a stable UUID and the HMGS flag', () => {
    const l = desteListesi(false);
    expect(l).toHaveLength(tumDesteler.length);
    for (const d of l) {
      expect(d.id).toMatch(UUID);
      expect(d.hmgs).toBe(true);
      expect(d.subject).not.toBeNull();
    }
    expect(new Set(l.map((d) => d.id)).size).toBe(l.length);
    expect(desteUuid('medeni-hukuk')).toBe(desteUuid('medeni-hukuk'));
  });

  it('counts only cards a learner can see: none before editor approval, all verified ones in preview', () => {
    const yayinda = (d: (typeof tumDesteler)[number]) =>
      d.kartlar.filter((k) => kartDurumu(k, true) === 'yayinda').length;
    for (const [i, d] of desteListesi(false).entries())
      expect(d.cardCount).toBe(yayinda(tumDesteler[i] as (typeof tumDesteler)[number]));
    for (const [i, d] of desteListesi(true).entries()) {
      expect(d.cardCount).toBe((tumDesteler[i] as (typeof tumDesteler)[number]).kartlar.length);
    }
  });
});

describe('deck cards', () => {
  it('returns null for an unknown deck and an empty list for a deck without published cards', () => {
    expect(desteKartlari('00000000-0000-4000-8000-000000000000', true)).toBeNull();
    const id = desteUuid('medeni-hukuk');
    expect(desteKartlari(id, false)).toEqual([]);
    expect(desteKartlari(id, true)?.length).toBeGreaterThan(0);
  });

  it('maps a card onto the contract fields and keeps the extra fields of the games', () => {
    const g = kartGorunumu(kartYap(), 'deneme-deste');
    const dto = kartDto(g);
    expect(dto).toMatchObject({
      id: g.uuid,
      kind: 'coktan_secmeli',
      front: g.soru,
      back: g.aciklama,
      choices: g.secenekler,
      sourceRecordId: null,
      due: null,
      oyun: 'olay_karti',
      dogruIndex: 1,
    });
    expect(
      kartDto(
        kartGorunumu(kartYap({ oyun: 'dogru_yanlis', secenekler: ['Doğru', 'Yanlış'], dogruIndex: 0 }), 'd'),
      ).kind,
    ).toBe('dogru_yanlis');
  });

  it('never carries editor names or verification fingerprints', () => {
    const json = JSON.stringify(desteKartlari(desteUuid('anayasa-hukuku'), true));
    expect(json).not.toContain('editorler');
    expect(json).not.toContain('maddeOzeti');
    expect(json).not.toContain('hazirlayan');
  });
});
