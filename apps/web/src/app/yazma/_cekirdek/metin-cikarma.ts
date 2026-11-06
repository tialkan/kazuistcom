import { strFromU8, unzipSync } from 'fflate';

/**
 * Text extraction for the upload step of plan 10.5/1: PDF, DOCX and TXT up to 20 MB. The file is read from
 * memory, its type is decided from the content (not the name alone), and nothing is written to disk. Text under
 * 200 characters raises the "may be a scanned PDF" notice (SRS 6.1). Used by the guide upload and, in the
 * browser, by the abbreviation list.
 */

export const AZAMI_BAYT = 20 * 1024 * 1024;
export const TARANMIS_ESIGI = 200;
export const AZAMI_PDF_SAYFA = 600;
export const AZAMI_KARAKTER = 4_000_000;
const ZIP_GIRDI_SINIRI = 2000;
const DOCUMENT_XML_SINIRI = 60 * 1024 * 1024;
const PDF_ZAMAN_ASIMI_MS = 30_000;

export type DosyaTuru = 'pdf' | 'docx' | 'txt';

export type YuklemeHatasiKodu =
  | 'bos'
  | 'cok_buyuk'
  | 'tur_desteklenmiyor'
  | 'tur_uyusmuyor'
  | 'bozuk'
  | 'sifreli'
  | 'zip_bomba'
  | 'zaman_asimi'
  | 'cok_sayfa';

export class YuklemeHatasi extends Error {
  constructor(
    readonly kod: YuklemeHatasiKodu,
    cause?: unknown,
  ) {
    super(kod, cause === undefined ? undefined : { cause });
    this.name = 'YuklemeHatasi';
  }
}

export interface MetinSayfasi {
  /** 1 based page number; null when the format has no reliable pages (TXT, DOCX without page marks). */
  sayfa: number | null;
  metin: string;
}

export type MetinUyarisi = 'taranmis_olabilir' | 'metin_az';

export interface CikarilanMetin {
  tur: DosyaTuru;
  sayfalar: MetinSayfasi[];
  karakter: number;
  uyarilar: MetinUyarisi[];
}

const UZANTI: Record<string, DosyaTuru> = { pdf: 'pdf', docx: 'docx', txt: 'txt' };

export function uzantidanTur(ad: string): DosyaTuru | null {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(ad.trim());
  return m?.[1] ? (UZANTI[m[1].toLowerCase()] ?? null) : null;
}

/** File type from the first bytes. TXT has no signature: it is text without NUL bytes. */
export function icerikTuru(bayt: Uint8Array): DosyaTuru | null {
  const bas = bayt.subarray(0, 1024);
  const ascii = (a: Uint8Array) => String.fromCharCode(...a);
  if (ascii(bas).includes('%PDF-')) return 'pdf';
  if (bayt.length > 3 && bayt[0] === 0x50 && bayt[1] === 0x4b && bayt[2] === 0x03 && bayt[3] === 0x04)
    return 'docx';
  if (bayt.subarray(0, 8192).includes(0)) return null;
  return 'txt';
}

const VARLIKLAR: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const varlikCoz = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, v: string) => {
    if (v.startsWith('#x')) return String.fromCodePoint(parseInt(v.slice(2), 16));
    if (v.startsWith('#')) return String.fromCodePoint(parseInt(v.slice(1), 10));
    return VARLIKLAR[v] ?? '';
  });

/** document.xml to text, split at page marks. No XML parser: entities are never expanded beyond the five. */
export function docxXmlMetni(xml: string): MetinSayfasi[] {
  const sayfalar: string[] = [''];
  let isaret = false;
  const paragraflar = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  for (const p of paragraflar) {
    if (/<w:pageBreakBefore\s*\/>/.test(p)) {
      sayfalar.push('');
      isaret = true;
    }
    let satir = '';
    const parcalar =
      p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>|<w:tab\s*\/>|<w:br[^>]*\/>|<w:lastRenderedPageBreak\s*\/>/g) ??
      [];
    for (const par of parcalar) {
      if (/^<w:t[ >]/.test(par))
        satir += varlikCoz(par.replace(/^<w:t(?: [^>]*)?>/, '').replace(/<\/w:t>$/, ''));
      else if (par.startsWith('<w:tab')) satir += ' ';
      else if (par.startsWith('<w:lastRenderedPageBreak')) {
        sayfalar[sayfalar.length - 1] += `${satir}`;
        satir = '';
        sayfalar.push('');
        isaret = true;
      } else if (/w:type="page"/.test(par)) {
        sayfalar[sayfalar.length - 1] += satir;
        satir = '';
        sayfalar.push('');
        isaret = true;
      } else satir += '\n';
    }
    sayfalar[sayfalar.length - 1] += `${satir}\n`;
  }
  const dolu = sayfalar.map((metin, i) => ({ sayfa: isaret ? i + 1 : null, metin }));
  return isaret ? dolu.filter((s) => s.metin.trim()) : [{ sayfa: null, metin: sayfalar.join('') }];
}

function docxMetni(bayt: Uint8Array): MetinSayfasi[] {
  let girdi = 0;
  let dosyalar: Record<string, Uint8Array>;
  try {
    dosyalar = unzipSync(bayt, {
      filter: (f) => {
        girdi += 1;
        if (girdi > ZIP_GIRDI_SINIRI) throw new YuklemeHatasi('zip_bomba');
        if (f.name !== 'word/document.xml') return false;
        if (f.originalSize > DOCUMENT_XML_SINIRI) throw new YuklemeHatasi('zip_bomba');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof YuklemeHatasi) throw e;
    throw new YuklemeHatasi('bozuk');
  }
  const belge = dosyalar['word/document.xml'];
  if (!belge) throw new YuklemeHatasi('bozuk');
  // The declared size can lie; the inflated length decides.
  if (belge.length > DOCUMENT_XML_SINIRI) throw new YuklemeHatasi('zip_bomba');
  return docxXmlMetni(strFromU8(belge));
}

function duzMetin(bayt: Uint8Array): MetinSayfasi[] {
  let metin: string;
  try {
    metin = new TextDecoder('utf-8', { fatal: true }).decode(bayt);
  } catch {
    metin = new TextDecoder('windows-1254').decode(bayt);
  }
  metin = metin.replace(/^\uFEFF/, '');
  if (!metin.includes('\f')) return [{ sayfa: null, metin }];
  return metin.split('\f').map((m, i) => ({ sayfa: i + 1, metin: m }));
}

async function pdfMetni(bayt: Uint8Array): Promise<MetinSayfasi[]> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const is = (async () => {
    // pdf.js transfers the buffer; hand it a copy so the caller's bytes stay usable.
    const belge = await getDocumentProxy(bayt.slice());
    const kapat = async () => {
      // The document proxy has no destroy(); its loading task owns the worker and the memory.
      await (
        belge as unknown as { loadingTask?: { destroy?: () => Promise<void> } }
      ).loadingTask?.destroy?.();
    };
    if (belge.numPages > AZAMI_PDF_SAYFA) {
      await kapat();
      throw new YuklemeHatasi('cok_sayfa');
    }
    try {
      const { text } = await extractText(belge, { mergePages: false });
      return text.map((metin, i) => ({ sayfa: i + 1, metin }));
    } finally {
      await kapat();
    }
  })();
  let zamanlayici: ReturnType<typeof setTimeout> | undefined;
  const sure = new Promise<never>((_, red) => {
    zamanlayici = setTimeout(() => red(new YuklemeHatasi('zaman_asimi')), PDF_ZAMAN_ASIMI_MS);
  });
  try {
    return await Promise.race([is, sure]);
  } catch (e) {
    if (e instanceof YuklemeHatasi) throw e;
    if (e instanceof Error && e.name === 'PasswordException') throw new YuklemeHatasi('sifreli');
    throw new YuklemeHatasi('bozuk', e);
  } finally {
    clearTimeout(zamanlayici);
  }
}

/** Extract the text of an uploaded file. Throws YuklemeHatasi; its code never carries file content. */
export async function metinCikar(bayt: Uint8Array, dosyaAdi: string): Promise<CikarilanMetin> {
  if (bayt.length === 0) throw new YuklemeHatasi('bos');
  if (bayt.length > AZAMI_BAYT) throw new YuklemeHatasi('cok_buyuk');
  const ad = uzantidanTur(dosyaAdi);
  if (!ad) throw new YuklemeHatasi('tur_desteklenmiyor');
  const icerik = icerikTuru(bayt);
  if (icerik !== ad) throw new YuklemeHatasi('tur_uyusmuyor');
  const sayfalar = ad === 'pdf' ? await pdfMetni(bayt) : ad === 'docx' ? docxMetni(bayt) : duzMetin(bayt);
  const karakter = sayfalar.reduce((n, s) => n + s.metin.trim().length, 0);
  if (karakter > AZAMI_KARAKTER) throw new YuklemeHatasi('cok_buyuk');
  const uyarilar: MetinUyarisi[] = [];
  if (karakter < TARANMIS_ESIGI) uyarilar.push(ad === 'pdf' ? 'taranmis_olabilir' : 'metin_az');
  return { tur: ad, sayfalar, karakter, uyarilar };
}

/** Whole text with page markers, the shape the extraction prompt reads. */
export function sayfaliMetin(m: CikarilanMetin): string {
  return m.sayfalar.map((s) => (s.sayfa === null ? s.metin : `[[SAYFA ${s.sayfa}]]\n${s.metin}`)).join('\n');
}
