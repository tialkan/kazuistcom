import { strFromU8, unzipSync } from 'fflate';
import { AZAMI_BAYT, YuklemeHatasi, docxXmlMetni } from './metin-cikarma.ts';

/** Word count of a DOCX for the writing log (FR-48). The file is not stored; footnote words are reported apart. */

const KELIME = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const SINIR = 60 * 1024 * 1024;
const GIRDI_SINIRI = 2000;

export const kelimeSay = (metin: string) => (metin.match(KELIME) ?? []).length;

export interface KelimeSayimi {
  words: number;
  footnoteWords: number;
}

export function docxKelimeSayimi(bayt: Uint8Array): KelimeSayimi {
  if (bayt.length === 0) throw new YuklemeHatasi('bos');
  if (bayt.length > AZAMI_BAYT) throw new YuklemeHatasi('cok_buyuk');
  if (!(bayt[0] === 0x50 && bayt[1] === 0x4b && bayt[2] === 0x03 && bayt[3] === 0x04)) throw new YuklemeHatasi('tur_uyusmuyor');
  let girdi = 0;
  let dosyalar: Record<string, Uint8Array>;
  try {
    dosyalar = unzipSync(bayt, {
      filter: (f) => {
        girdi += 1;
        if (girdi > GIRDI_SINIRI) throw new YuklemeHatasi('zip_bomba');
        if (f.name !== 'word/document.xml' && f.name !== 'word/footnotes.xml') return false;
        if (f.originalSize > SINIR) throw new YuklemeHatasi('zip_bomba');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof YuklemeHatasi) throw e;
    throw new YuklemeHatasi('bozuk');
  }
  const belge = dosyalar['word/document.xml'];
  if (!belge) throw new YuklemeHatasi('bozuk');
  if (belge.length > SINIR) throw new YuklemeHatasi('zip_bomba');
  const govde = docxXmlMetni(strFromU8(belge))
    .map((s) => s.metin)
    .join('\n');
  const dipnot = dosyalar['word/footnotes.xml'];
  let dipnotKelime = 0;
  if (dipnot) {
    if (dipnot.length > SINIR) throw new YuklemeHatasi('zip_bomba');
    // Separator footnotes carry no text, so every <w:t> in the part belongs to a real footnote.
    dipnotKelime = kelimeSay(docxXmlMetni(strFromU8(dipnot)).map((s) => s.metin).join('\n'));
  }
  return { words: kelimeSay(govde), footnoteWords: dipnotKelime };
}
