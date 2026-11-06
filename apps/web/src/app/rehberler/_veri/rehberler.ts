/**
 * Guide content, imported from content/rehberler at build time and validated with the schemas of `_alan/sema.ts`.
 * `rehberler.test.ts` checks that every JSON file of the directory is listed here.
 */
import etikJson from '../../../../../../content/rehberler/etik.json' with { type: 'json' };
import kontrolJson from '../../../../../../content/rehberler/kontrol-listesi.json' with { type: 'json' };
import makaleJson from '../../../../../../content/rehberler/makale.json' with { type: 'json' };
import tezJson from '../../../../../../content/rehberler/tez.json' with { type: 'json' };
import zoteroEndnoteJson from '../../../../../../content/rehberler/zotero-endnote.json' with { type: 'json' };
import {
  etikSchema,
  kontrolSchema,
  makaleSchema,
  tezSchema,
  zoteroEndnoteSchema,
  type Adim,
} from '../_alan/sema.ts';

export const makale = makaleSchema.parse(makaleJson);
export const tez = tezSchema.parse(tezJson);
export const zoteroEndnote = zoteroEndnoteSchema.parse(zoteroEndnoteJson);
export const kontrol = kontrolSchema.parse(kontrolJson);
export const etik = etikSchema.parse(etikJson);

/** Ids that may be stored as done; progress read from the browser is cut down to these. */
export const gecerliIdler = {
  makale: makale.adimlar.map((a) => a.id),
  tez: tez.adimlar.map((a) => a.id),
  kontrol: kontrol.maddeler.map((m) => m.id),
} as const;

export const kaynakBul = (id: string | undefined) => tez.kaynaklar.find((k) => k.id === id);

export type { Adim };
