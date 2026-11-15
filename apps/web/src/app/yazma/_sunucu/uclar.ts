import { randomUUID } from 'node:crypto';
import tr from '@kazuist/i18n/tr/yazma.json' with { type: 'json' };
import { logWarn } from '@kazuist/log';
import { after } from 'next/server';
import { z } from 'zod';
import {
  AbbreviationsInput,
  DocxCountUpload,
  TemplateCheckUpload,
  TemplateRulesUpload,
  WritingSettings,
  type ErrorCode,
} from '@kazuist/contracts';
import { withAuth, withPublic } from '@/server/auth/guard.ts';
import { apiError, json, rateLimited, readJson } from '@/server/auth/http.ts';
import { clientIp, type RateRule } from '@/server/auth/rate-limit.ts';
import { adaylariBul, onerilerleDoldur, sirala, type KisaltmaModeli } from '../_cekirdek/kisaltmalar.ts';
import { yzEngelKodu } from '../_cekirdek/yz-engel.ts';
import { type KuralModeli } from '../_cekirdek/kural-cikarma.ts';
import { degerleriDogrula, kuralListesi, type SablonTuru } from '../_cekirdek/kural-semasi.ts';
import { docxKelimeSayimi } from '../_cekirdek/kelime-say.ts';
import {
  AZAMI_BAYT,
  YuklemeHatasi,
  docxYapisiniDogrula,
  icerikTuru,
  uzantidanTur,
  type YuklemeHatasiKodu,
} from '../_cekirdek/metin-cikarma.ts';
import { pythonDenetimIstemcisi, type DenetimIstemcisi } from './denetim.ts';
import { dergiAra, dergiyiBul, onayliKurallar } from './dergiler.ts';
import { cikarmayiCalistir, isOlustur, isiBitir, isiGetir, kayitGetir, kayitSil } from './kurallar.ts';
import {
  hitapOku,
  hitapYaz,
  ilerlemeGirdisiOku,
  ilerlemeKaydet,
  projeGirdisiOku,
  projeGuncellemeOku,
  projeGuncelle,
  projeOlustur,
  projeleriListele,
  projeyiGetir,
  projeyiSil,
} from './projeler.ts';
import { kisaltmaModeli, kuralModeli, type YzKimlik } from './yz.ts';

/** Rate rules of the writing endpoints; per user unless noted (plan 5.6/3). */
export const hizlar = {
  genel: { name: 'yazma-genel', limit: 120, windowSec: 60 },
  kuralYukle: { name: 'yazma-kural', limit: 5, windowSec: 3600 },
  denetim: { name: 'yazma-denetim', limit: 20, windowSec: 3600 },
  kisaltma: { name: 'yazma-kisaltma', limit: 10, windowSec: 3600 },
  dergiIp: { name: 'yazma-dergi-ip', limit: 120, windowSec: 60 },
} satisfies Record<string, RateRule>;

/** Outside collaborators of the handlers; tests replace them. */
export interface Bagimliliklar {
  now: () => Date;
  /** The model ports get who asks, so the AI gateway budgets per user and IP and holds the credits. */
  kuralModeli: (kim: YzKimlik) => KuralModeli | null;
  kisaltmaModeli: (kim: YzKimlik) => KisaltmaModeli | null;
  denetim: () => DenetimIstemcisi | null;
  /** Runs work after the response (Next `after`); tests run it inline. */
  sonra: (is: () => Promise<void>) => void;
}

export const varsayilan: Bagimliliklar = {
  now: () => new Date(),
  kuralModeli: (kim) => kuralModeli(kim),
  kisaltmaModeli: (kim) => kisaltmaModeli(kim),
  denetim: () => pythonDenetimIstemcisi(),
  sonra: (is) => after(is),
};

const hataMetni: Record<YuklemeHatasiKodu, string> = {
  bos: tr.hata.bos,
  cok_buyuk: tr.hata.cokBuyuk,
  tur_desteklenmiyor: tr.hata.turDesteklenmiyor,
  tur_uyusmuyor: tr.hata.turUyusmuyor,
  bozuk: tr.hata.bozuk,
  sifreli: tr.hata.sifreli,
  zip_bomba: tr.hata.zipBomba,
  zaman_asimi: tr.hata.zamanAsimi,
  cok_sayfa: tr.hata.cokSayfa,
};

export function yuklemeHatasi(e: YuklemeHatasi): Response {
  const kod: ErrorCode = e.kod === 'cok_buyuk' || e.kod === 'zip_bomba' ? 'payload_too_large' : 'bad_request';
  return apiError(kod, hataMetni[e.kod]);
}

/**
 * Multipart body with a hard size cap. A declared length over the cap is refused before reading; without a
 * length the stream is counted while it is read, so a chunked upload cannot exceed it either.
 */
export async function formVerisi(req: Request, azami = AZAMI_BAYT + 64 * 1024): Promise<FormData> {
  const bildirilen = Number(req.headers.get('content-length') ?? '0');
  if (bildirilen > azami) throw new YuklemeHatasi('cok_buyuk');
  const tip = req.headers.get('content-type') ?? '';
  if (!tip.toLowerCase().startsWith('multipart/form-data')) throw new YuklemeHatasi('bozuk');
  const okuyucu = req.body?.getReader();
  if (!okuyucu) throw new YuklemeHatasi('bos');
  const parcalar: Uint8Array[] = [];
  let toplam = 0;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    toplam += value.length;
    if (toplam > azami) {
      await okuyucu.cancel();
      throw new YuklemeHatasi('cok_buyuk');
    }
    parcalar.push(value);
  }
  try {
    return await new Response(new Blob(parcalar as BlobPart[]), {
      headers: { 'content-type': tip },
    }).formData();
  } catch {
    throw new YuklemeHatasi('bozuk');
  }
}

async function dosyaAl(req: Request): Promise<{ bayt: Uint8Array; ad: string; form: FormData }> {
  const form = await formVerisi(req);
  const dosya = form.get('file');
  if (!(dosya instanceof File)) throw new YuklemeHatasi('bos');
  return { bayt: new Uint8Array(await dosya.arrayBuffer()), ad: dosya.name, form };
}

/**
 * Text parts of a multipart body, for the contract's upload schemas: an absent part is left out (FormData gives
 * `null`), so `.optional()` and `.default()` in the schema apply; a part that is a file is passed as it is and the
 * schema decides.
 */
function formAlanlari(form: FormData, adlar: readonly string[]): Record<string, FormDataEntryValue> {
  const cikti: Record<string, FormDataEntryValue> = {};
  for (const ad of adlar) {
    const d = form.get(ad);
    if (d !== null) cikti[ad] = d;
  }
  return cikti;
}

const Kimlik = z.uuid();
const kimlikli = (params: Record<string, string>, ad = 'id') => {
  const r = Kimlik.safeParse(params[ad]);
  return r.success ? r.data : null;
};

// ---- Writing projects --------------------------------------------------------------------------------------

export const projelerGet = (_b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (_req, p, ctx) => json(await projeleriListele(ctx.db, p.userId)));

export const projelerPost = (b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (req, p, ctx) => {
    const g = projeGirdisiOku(await readJson(req));
    if (!g) return apiError('bad_request');
    return json(await projeOlustur(ctx.db, p.userId, g, b.now()), 201);
  });

export const projeGet = (b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (_req, p, ctx, params) => {
    const id = kimlikli(params);
    const r = id ? await projeyiGetir(ctx.db, p.userId, id, b.now()) : null;
    return r ? json(r) : apiError('not_found');
  });

export const projePatch = (b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (req, p, ctx, params) => {
    const id = kimlikli(params);
    const g = projeGuncellemeOku(await readJson(req));
    if (!id) return apiError('not_found');
    if (!g) return apiError('bad_request');
    const r = await projeGuncelle(ctx.db, p.userId, id, g, b.now());
    return r ? json(r) : apiError('not_found');
  });

export const projeDelete = (_b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (_req, p, ctx, params) => {
    const id = kimlikli(params);
    if (!id || !(await projeyiSil(ctx.db, p.userId, id))) return apiError('not_found');
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });

export const ilerlemePost = (b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (req, p, ctx, params) => {
    const id = kimlikli(params);
    const g = ilerlemeGirdisiOku(await readJson(req));
    if (!id) return apiError('not_found');
    if (!g) return apiError('bad_request');
    if (!(await ilerlemeKaydet(ctx.db, p.userId, id, g, b.now()))) return apiError('not_found');
    return json({ ok: true }, 201);
  });

/**
 * Counts words in an uploaded DOCX (contract: the file is not stored). The count touches no project data, so the
 * id in the path only has to be a UUID; it is not looked up (no project information can leak through it).
 */
export const docxSayimiPost = (_b = varsayilan) =>
  withAuth({ rate: hizlar.denetim }, async (req, _p, _ctx, params) => {
    if (!kimlikli(params)) return apiError('not_found');
    try {
      const { bayt, ad, form } = await dosyaAl(req);
      if (!DocxCountUpload.safeParse(formAlanlari(form, ['file'])).success) return apiError('bad_request');
      if (uzantidanTur(ad) !== 'docx' || icerikTuru(bayt) !== 'docx')
        throw new YuklemeHatasi('tur_uyusmuyor');
      return json(docxKelimeSayimi(bayt));
    } catch (e) {
      if (e instanceof YuklemeHatasi) return yuklemeHatasi(e);
      throw e;
    }
  });

export const ayarlarGet = (_b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (_req, p, ctx) => json({ hitap: await hitapOku(ctx.db, p.userId) }));

export const ayarlarPut = (_b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (req, p, ctx) => {
    const g = WritingSettings.safeParse(await readJson(req));
    if (!g.success) return apiError('bad_request');
    await hitapYaz(ctx.db, p.userId, g.data.hitap);
    return json(g.data);
  });

// ---- Journals ----------------------------------------------------------------------------------------------------

const AramaSorgusu = z.object({ q: z.string().max(200).optional() });

export const dergilerGet = (_b = varsayilan) =>
  withPublic(hizlar.dergiIp, async (req, ctx) => {
    const q = AramaSorgusu.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!q.success) return apiError('bad_request');
    const liste = await dergiAra(ctx.db, q.data.q);
    return json(
      liste.map((d) => ({ id: d.id, name: d.name, issn: d.issn, hasApprovedRules: d.hasApprovedRules })),
    );
  });

export const dergiKurallariGet = (_b = varsayilan) =>
  withPublic(hizlar.dergiIp, async (req, ctx) => {
    const id = Kimlik.safeParse(new URL(req.url).pathname.split('/').at(-2));
    const dergi = id.success ? await dergiyiBul(ctx.db, { id: id.data }) : null;
    const k = dergi ? await onayliKurallar(ctx.db, dergi.id) : null;
    if (!k) return apiError('not_found');
    return json({ id: k.id, version: k.version, approvedAt: k.approvedAt, rules: kuralListesi(k.kayit) });
  });

// ---- Guide rule extraction -------------------------------------------------------------------------------------------

export const kuralYuklePost = (b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (req, p, ctx) => {
    // The file is validated first, whatever the state of the AI service: a bad file is always a 4xx.
    let dosya: Awaited<ReturnType<typeof dosyaAl>>;
    try {
      dosya = await dosyaAl(req);
    } catch (e) {
      if (e instanceof YuklemeHatasi) return yuklemeHatasi(e);
      throw e;
    }
    const yukleme = TemplateRulesUpload.safeParse(
      formAlanlari(dosya.form, ['file', 'institutionName', 'kind']),
    );
    if (!yukleme.success) return apiError('bad_request');
    const tur = { data: yukleme.data.kind };
    const kurum = yukleme.data.institutionName?.trim() || null;
    try {
      const ad = uzantidanTur(dosya.ad);
      if (!ad) throw new YuklemeHatasi('tur_desteklenmiyor');
      if (icerikTuru(dosya.bayt) !== ad) throw new YuklemeHatasi('tur_uyusmuyor');
      if (ad === 'docx') docxYapisiniDogrula(dosya.bayt);
    } catch (e) {
      if (e instanceof YuklemeHatasi) return yuklemeHatasi(e);
      throw e;
    }
    // The paid path is limited per user; refused files above never count against it.
    const karar = await ctx.limiter.check(hizlar.kuralYukle, p.userId);
    if (!karar.ok) return rateLimited(karar.retryAfterSec);
    const is = await isOlustur(ctx.db, p.userId, tur.data, req.headers.get('idempotency-key') ?? undefined);
    if (!is.yeni) return json({ jobId: is.id }, 202);
    const model = b.kuralModeli({
      userId: p.userId,
      ip: clientIp(req.headers, ctx.config.trustedProxies),
      istekKimligi: is.id,
    });
    if (!model) {
      // Fail closed: nothing is sent anywhere and nothing is invented. The job says why it did not run, the
      // file is dropped (it is never stored), and the user is told to start with example values.
      await isiBitir(ctx.db, is.id, 'failed', null, 'yz_yok');
      return json({ jobId: is.id }, 202);
    }
    b.sonra(() =>
      cikarmayiCalistir(ctx.db, {
        jobId: is.id,
        userId: p.userId,
        kind: tur.data as SablonTuru,
        bayt: dosya.bayt,
        dosyaAdi: dosya.ad,
        kurum,
        model,
      }),
    );
    return json({ jobId: is.id }, 202);
  });

export const isGet = (_b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (_req, p, ctx, params) => {
    const id = kimlikli(params);
    const is = id ? await isiGetir(ctx.db, p.userId, id) : null;
    return is ? json(is) : apiError('not_found');
  });

export const kuralGet = (_b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (_req, p, ctx, params) => {
    const id = kimlikli(params);
    const r = id ? await kayitGetir(ctx.db, p.userId, id) : null;
    if (!r) return apiError('not_found');
    return json({
      id: r.id,
      model: r.model,
      institutionName: r.institutionName,
      tur: r.kayit.tur,
      degerler: r.kayit.degerler,
      kaynaklar: r.kayit.kaynaklar,
      kanitlar: r.kayit.kanitlar,
    });
  });

export const kuralDelete = (_b = varsayilan) =>
  withAuth({ rate: hizlar.genel }, async (_req, p, ctx, params) => {
    const id = kimlikli(params);
    if (!id || !(await kayitSil(ctx.db, p.userId, id))) return apiError('not_found');
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });

// ---- Abbreviations ---------------------------------------------------------------------------------------------------

export const kisaltmalarPost = (b = varsayilan) =>
  withAuth({ rate: hizlar.kisaltma }, async (req, p, ctx) => {
    const g = AbbreviationsInput.safeParse(await readJson(req));
    if (!g.success) return apiError('bad_request');
    let adaylar = adaylariBul(g.data.text);
    // X-Yazma-Oneri says why no suggestion came back: kapali (service off or failed), or the credit and cap
    // refusals of yz-engel.ts, which the client explains with their own message. The table is always returned.
    let oneri: 'kapali' | 'kredi_yetersiz' | 'butce_tavani' | null = null;
    if (g.data.useAi) {
      const model = b.kisaltmaModeli({
        userId: p.userId,
        ip: clientIp(req.headers, ctx.config.trustedProxies),
        istekKimligi: randomUUID(),
      });
      if (!model) oneri = 'kapali';
      else {
        try {
          adaylar = await onerilerleDoldur(adaylar, model);
        } catch (e) {
          oneri = yzEngelKodu(e) ?? 'kapali';
        }
      }
    }
    return json(
      sirala(adaylar).map((a) => ({ short: a.kisa, long: a.uzun, source: a.kaynak, count: a.sayi })),
      200,
      oneri ? { 'X-Yazma-Oneri': oneri } : {},
    );
  });

// ---- DOCX check ------------------------------------------------------------------------------------------------------

/** The JSON string in the `rules` part of TemplateCheckUpload: {tur, degerler}. */
const DenetimKurallari = z.strictObject({
  tur: z.enum(['tez', 'makale']),
  degerler: z.record(z.string(), z.unknown()),
});

export const denetimPost = (b = varsayilan) =>
  withAuth({ rate: hizlar.denetim }, async (req) => {
    const istemci = b.denetim();
    if (!istemci) return apiError('unavailable', tr.hata.denetimYok);
    let dosya: Awaited<ReturnType<typeof dosyaAl>>;
    try {
      dosya = await dosyaAl(req);
    } catch (e) {
      if (e instanceof YuklemeHatasi) return yuklemeHatasi(e);
      throw e;
    }
    if (uzantidanTur(dosya.ad) !== 'docx' || icerikTuru(dosya.bayt) !== 'docx')
      return yuklemeHatasi(new YuklemeHatasi('tur_uyusmuyor'));
    const yukleme = TemplateCheckUpload.safeParse(formAlanlari(dosya.form, ['file', 'rules']));
    if (!yukleme.success) return apiError('bad_request');
    let kurallar: z.infer<typeof DenetimKurallari>;
    try {
      kurallar = DenetimKurallari.parse(JSON.parse(yukleme.data.rules));
    } catch {
      return apiError('bad_request');
    }
    const d = degerleriDogrula(kurallar.degerler);
    if (!d.ok) return apiError('bad_request');
    let yanit;
    try {
      yanit = await istemci(dosya.bayt, kurallar.tur, d.degerler);
    } catch (e) {
      logWarn('docxcheck', e);
      return apiError('unavailable', tr.hata.denetimYok);
    }
    if (yanit.durum === 200) return json(yanit.govde);
    if (yanit.durum === 413) return yuklemeHatasi(new YuklemeHatasi('cok_buyuk'));
    if (yanit.durum === 422 || yanit.durum === 400) return yuklemeHatasi(new YuklemeHatasi('bozuk'));
    return apiError('unavailable', tr.hata.denetimYok);
  });
