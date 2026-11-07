import eski from '../_icerik/eski.json';
import tr from '../_icerik/tr.json';
import trDegerlendirme from '../_icerik/tr_degerlendirme.json';
import trHakkinda from '../_icerik/tr_hakkinda.json';
import trCerezler from '../_icerik/tr_hukuki_cerezler.json';
import trErisilebilirlik from '../_icerik/tr_hukuki_erisilebilirlik.json';
import trGizlilik from '../_icerik/tr_hukuki_gizlilik.json';
import trUyari from '../_icerik/tr_hukuki_uyari.json';
import trYapayZeka from '../_icerik/tr_hukuki_yapay-zeka.json';
import trNasilCalisir from '../_icerik/tr_nasil-calisir.json';
import trOrtak from '../_icerik/tr_ortak.json';
import trSorun from '../_icerik/tr_sorun.json';
import type { Dugum } from './Dugum.tsx';

export type CasuistSayfaVerisi = {
  path: string;
  source: string;
  lang: string;
  title: string;
  description: string;
  nav: { href: string; text: string }[];
  tagline: string | null;
  main: Dugum[];
};

const v = (d: unknown) => d as CasuistSayfaVerisi;

/**
 * Archived Casuist pages, keyed by the route that serves them (Ek H). Turkish only (ADR-0032): the English
 * pages and their language links were removed without redirects.
 */
export const casuistSayfalari = {
  tr: v(tr),
  'tr/sorun': v(trSorun),
  'tr/nasil-calisir': v(trNasilCalisir),
  'tr/degerlendirme': v(trDegerlendirme),
  'tr/ortak': v(trOrtak),
  'tr/hakkinda': v(trHakkinda),
  'hukuki/uyari': v(trUyari),
  'hukuki/gizlilik': v(trGizlilik),
  'hukuki/cerezler': v(trCerezler),
  'hukuki/yapay-zeka': v(trYapayZeka),
  'hukuki/erisilebilirlik': v(trErisilebilirlik),
  eski: v(eski),
} as const;
export type CasuistAnahtari = keyof typeof casuistSayfalari;

export const trSayfalari = ['sorun', 'nasil-calisir', 'degerlendirme', 'ortak', 'hakkinda'] as const;
