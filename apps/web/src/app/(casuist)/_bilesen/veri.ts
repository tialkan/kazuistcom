import about from '../_icerik/about.json';
import eski from '../_icerik/eski.json';
import evaluation from '../_icerik/evaluation.json';
import howItWorks from '../_icerik/how-it-works.json';
import index from '../_icerik/index.json';
import legalAccessibility from '../_icerik/legal_accessibility.json';
import legalAi from '../_icerik/legal_ai.json';
import legalCookies from '../_icerik/legal_cookies.json';
import legalNotice from '../_icerik/legal_notice.json';
import legalPrivacy from '../_icerik/legal_privacy.json';
import partner from '../_icerik/partner.json';
import problem from '../_icerik/problem.json';
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
  langLink: { href: string; text: string; hreflang: string } | null;
  tagline: string | null;
  main: Dugum[];
};

const v = (d: unknown) => d as CasuistSayfaVerisi;

/** Archived Casuist pages, keyed by the route that serves them (Ek H). */
export const casuistSayfalari = {
  en: v(index),
  problem: v(problem),
  'how-it-works': v(howItWorks),
  evaluation: v(evaluation),
  partner: v(partner),
  about: v(about),
  'legal/notice': v(legalNotice),
  'legal/privacy': v(legalPrivacy),
  'legal/cookies': v(legalCookies),
  'legal/ai': v(legalAi),
  'legal/accessibility': v(legalAccessibility),
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

/** English legal page to its binding Turkish counterpart (Ek H rows 7-11). */
export const legalEslesme = {
  notice: 'uyari',
  privacy: 'gizlilik',
  cookies: 'cerezler',
  ai: 'yapay-zeka',
  accessibility: 'erisilebilirlik',
} as const;
export const trSayfalari = ['sorun', 'nasil-calisir', 'degerlendirme', 'ortak', 'hakkinda'] as const;
