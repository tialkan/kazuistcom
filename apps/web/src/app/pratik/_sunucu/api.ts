/**
 * Deck and card API of the Pratik module (contract paths /v1/decks and /v1/decks/{id}/cards). The functions are
 * pure over the deck files; the route files under app/api/v1/decks add rate limits and, for the cards, a session.
 *
 * The contract Card (v1.4) has the fields kind, front, back, choices, sourceRecordId and due. The four games
 * of SRS section 7 and the card model of plan 10.6/1 need more, so the answer carries the extra fields `oyun`,
 * `dogruIndex`, `kanun`, `baglantilar`, `kaynakKayitIdleri`, `zorluk`, `hmgsAlani` and `surum`; the contract
 * allows additional properties. The contract change is requested in docs/istekler/pratik-sozlesme.md.
 */
import { hmgsAlaniBul } from '../_alan/hmgs-alanlari.ts';
import { kartUuid, type KartGorunumu } from '../_alan/kart.ts';
import { gorunenKartlar, tumDesteler } from '../_veri/desteler.ts';

export const desteUuid = (slug: string) => kartUuid(`deste:${slug}`);

export interface DesteDto {
  id: string;
  title: string;
  subject: string | null;
  cardCount: number;
  hmgs: boolean;
}

export function desteListesi(onizleme: boolean): DesteDto[] {
  return tumDesteler.map((d) => ({
    id: desteUuid(d.slug),
    title: d.baslik,
    subject: d.hmgsAlani ? (hmgsAlaniBul(d.hmgsAlani)?.ad ?? null) : null,
    cardCount: gorunenKartlar(d, onizleme).length,
    hmgs: d.hmgsAlani !== null,
  }));
}

export interface KartDto {
  id: string;
  kind: 'dogru_yanlis' | 'coktan_secmeli';
  front: string;
  back: string;
  choices: string[];
  sourceRecordId: null;
  due: null;
  oyun: KartGorunumu['oyun'];
  dogruIndex: number;
  kanun: KartGorunumu['kanun'];
  baglantilar: KartGorunumu['baglantilar'];
  kaynakKayitIdleri: string[];
  zorluk: number;
  hmgsAlani: string | null;
  surum: number;
}

export function kartDto(k: KartGorunumu): KartDto {
  return {
    id: k.uuid,
    kind: k.oyun === 'dogru_yanlis' ? 'dogru_yanlis' : 'coktan_secmeli',
    front: k.soru,
    back: k.aciklama,
    choices: k.secenekler,
    sourceRecordId: null,
    due: null,
    oyun: k.oyun,
    dogruIndex: k.dogruIndex,
    kanun: k.kanun,
    baglantilar: k.baglantilar,
    kaynakKayitIdleri: k.kaynakKayitIdleri,
    zorluk: k.zorluk,
    hmgsAlani: k.hmgsAlani,
    surum: k.surum,
  };
}

/** Cards of one deck by its UUID; null when there is no such deck. Only visible cards are listed. */
export function desteKartlari(id: string, onizleme: boolean): KartDto[] | null {
  const deste = tumDesteler.find((d) => desteUuid(d.slug) === id);
  return deste ? gorunenKartlar(deste, onizleme).map(kartDto) : null;
}
