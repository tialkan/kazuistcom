/**
 * Decks of the Pratik module. The JSON files in content/desteler are imported at build time (the standalone image
 * has no content directory) and validated with the card schema: an invalid file stops the build.
 * `desteler.test.ts` checks that every JSON file of the directory is listed here.
 */
import anayasaHukuku from '../../../../../../content/desteler/anayasa-hukuku.json' with { type: 'json' };
import anayasaYargisi from '../../../../../../content/desteler/anayasa-yargisi.json' with { type: 'json' };
import genelKamuHukuku from '../../../../../../content/desteler/genel-kamu-hukuku.json' with { type: 'json' };
import idareHukuku from '../../../../../../content/desteler/idare-hukuku.json' with { type: 'json' };
import idariYargilamaUsulu from '../../../../../../content/desteler/idari-yargilama-usulu.json' with { type: 'json' };
import medeniHukuk from '../../../../../../content/desteler/medeni-hukuk.json' with { type: 'json' };
import milletlerarasiHukuk from '../../../../../../content/desteler/milletlerarasi-hukuk.json' with { type: 'json' };
import { desteSchema, kartDurumu, kartGorunumu, type Deste, type KartGorunumu } from '../_alan/kart.ts';
import { hmgsAlanlari, type HmgsAlani } from '../_alan/hmgs-alanlari.ts';

export const tumDesteler: readonly Deste[] = [
  anayasaHukuku,
  anayasaYargisi,
  genelKamuHukuku,
  idareHukuku,
  idariYargilamaUsulu,
  medeniHukuk,
  milletlerarasiHukuk,
].map((d) => desteSchema.parse(d));

export const desteBul = (slug: string) => tumDesteler.find((d) => d.slug === slug);

/**
 * Cards a learner may see. Only published cards (verified source and the required editor approvals) are served.
 * In preview mode (staging, PRATIK_ONIZLEME=1) cards waiting for approval are served too; drafts never are.
 */
export function gorunenKartlar(deste: Deste, onizleme: boolean): KartGorunumu[] {
  return deste.kartlar
    .filter((k) => {
      const d = kartDurumu(k, deste.hmgsAlani !== null);
      return d === 'yayinda' || (onizleme && d === 'onay_bekliyor');
    })
    .map((k) => kartGorunumu(k, deste.slug));
}

export interface AlanOzeti {
  alan: HmgsAlani;
  deste: Deste | null;
  /** Cards a learner can see now. */
  gorunen: number;
  /** Cards with a verified source that still wait for editor approval. */
  onayBekleyen: number;
}

export function alanOzetleri(onizleme: boolean): AlanOzeti[] {
  return hmgsAlanlari.map((alan) => {
    const deste = tumDesteler.find((d) => d.hmgsAlani === alan.slug) ?? null;
    return {
      alan,
      deste,
      gorunen: deste ? gorunenKartlar(deste, onizleme).length : 0,
      onayBekleyen: deste ? deste.kartlar.filter((k) => kartDurumu(k, true) === 'onay_bekliyor').length : 0,
    };
  });
}

/** Every visible HMGS card, the pool of the practice exam. */
export function denemeHavuzu(onizleme: boolean): KartGorunumu[] {
  return tumDesteler.filter((d) => d.hmgsAlani !== null).flatMap((d) => gorunenKartlar(d, onizleme));
}

/** Preview of unapproved cards is for staging only; production never sets the variable. */
export const onizlemeAcik = () => process.env.PRATIK_ONIZLEME === '1';
