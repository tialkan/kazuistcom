import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@/server/auth/db.ts';
import {
  createHarness,
  BASE,
  freshIp,
  params,
  signUp,
  type Harness,
} from '@/server/auth/__tests__/harness.ts';
import { sablonUret } from './_cekirdek/docx-uret.ts';
import { ornekKayit, varsayilanDegerler } from './_cekirdek/kural-semasi.ts';
import type { KuralModeli } from './_cekirdek/kural-cikarma.ts';
import { dergiTaslagiOlustur } from './_sunucu/dergiler.ts';
import { denetimKurallari } from './_sunucu/denetim.ts';
import {
  ayarlarGet,
  ayarlarPut,
  denetimPost,
  dergiKurallariGet,
  dergilerGet,
  docxSayimiPost,
  ilerlemePost,
  isGet,
  kisaltmalarPost,
  kuralDelete,
  kuralGet,
  kuralYuklePost,
  projeDelete,
  projeGet,
  projePatch,
  projelerGet,
  projelerPost,
  hizlar,
  varsayilan,
  type Bagimliliklar,
} from './_sunucu/uclar.ts';

const SIMDI = new Date('2026-11-07T10:00:00Z');
let h: Harness;
let a: string;
let b: string;
let aId: string;

beforeAll(async () => {
  h = await createHarness();
  a = (await signUp('yazar-a@example.invalid')).token;
  b = (await signUp('yazar-b@example.invalid')).token;
  const [u] = await h.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'yazar-a@example.invalid'));
  aId = u?.id as string;
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

const bekleyen: Promise<void>[] = [];
const bag = (o: Partial<Bagimliliklar> = {}): Bagimliliklar => ({
  ...varsayilan,
  now: () => SIMDI,
  kuralModeli: () => null,
  kisaltmaModeli: () => null,
  denetim: () => null,
  sonra: (is) => {
    bekleyen.push(is());
  },
  ...o,
});
const bitir = async () => {
  await Promise.all(bekleyen.splice(0));
};

const istek = (yol: string, token: string | null, init: RequestInit & { json?: unknown } = {}) => {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  headers.set('x-forwarded-for', freshIp());
  const { json, ...rest } = init;
  let body = rest.body;
  if (json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(json);
  }
  return new Request(`${BASE}/api${yol}`, { ...rest, headers, body });
};
const gov = async (r: Response) => JSON.parse(await r.text());
const rc = (id: string) => params({ id });

const proje = { title: 'Makale', kind: 'makale', targetWords: 6000, deadline: '2026-12-07' };

async function projeAc(token = a, g: Record<string, unknown> = proje) {
  const r = await projelerPost(bag())(istek('/v1/writing-projects', token, { method: 'POST', json: g }));
  expect(r.status).toBe(201);
  return (await gov(r)) as { id: string };
}

describe('writing projects (FR-45)', () => {
  it('needs an account', async () => {
    expect((await projelerGet(bag())(istek('/v1/writing-projects', null))).status).toBe(401);
    expect(
      (await projelerPost(bag())(istek('/v1/writing-projects', null, { method: 'POST', json: proje })))
        .status,
    ).toBe(401);
  });
  it('creates, lists, reads, updates and deletes a project', async () => {
    const p = await projeAc();
    const liste = await gov(await projelerGet(bag())(istek('/v1/writing-projects', a)));
    expect(liste.map((x: { id: string }) => x.id)).toContain(p.id);
    const tek = await gov(await projeGet(bag())(istek(`/v1/writing-projects/${p.id}`, a), rc(p.id)));
    expect(tek).toMatchObject({
      title: 'Makale',
      kind: 'makale',
      targetWords: 6000,
      deadline: '2026-12-07',
      currentWords: 0,
    });
    expect(tek.recentLogs).toEqual([]);
    expect(tek.createdOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const g = await projePatch(bag())(
      istek(`/v1/writing-projects/${p.id}`, a, { method: 'PATCH', json: { targetWords: 8000 } }),
      rc(p.id),
    );
    expect((await gov(g)).targetWords).toBe(8000);
    const s = await projeDelete(bag())(
      istek(`/v1/writing-projects/${p.id}`, a, { method: 'DELETE' }),
      rc(p.id),
    );
    expect(s.status).toBe(204);
    expect((await projeGet(bag())(istek(`/v1/writing-projects/${p.id}`, a), rc(p.id))).status).toBe(404);
  });
  it('rejects invalid input', async () => {
    for (const bad of [
      {},
      { ...proje, kind: 'roman' },
      { ...proje, targetWords: -1 },
      { ...proje, deadline: '07.12.2026' },
      { ...proje, ekstra: 1 },
      { ...proje, title: ' ' },
    ]) {
      const r = await projelerPost(bag())(istek('/v1/writing-projects', a, { method: 'POST', json: bad }));
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
  });
  it('never shows or changes another user project (IDOR)', async () => {
    const p = await projeAc();
    expect((await projeGet(bag())(istek(`/v1/writing-projects/${p.id}`, b), rc(p.id))).status).toBe(404);
    expect(
      (
        await projePatch(bag())(
          istek(`/v1/writing-projects/${p.id}`, b, { method: 'PATCH', json: { title: 'x' } }),
          rc(p.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (await projeDelete(bag())(istek(`/v1/writing-projects/${p.id}`, b, { method: 'DELETE' }), rc(p.id)))
        .status,
    ).toBe(404);
    expect(
      (
        await ilerlemePost(bag())(
          istek(`/v1/writing-projects/${p.id}/progress`, b, { method: 'POST', json: { words: 10 } }),
          rc(p.id),
        )
      ).status,
    ).toBe(404);
    const listeB = await gov(await projelerGet(bag())(istek('/v1/writing-projects', b)));
    expect(listeB.map((x: { id: string }) => x.id)).not.toContain(p.id);
    expect((await projeGet(bag())(istek('/v1/writing-projects/degil', a), rc('degil'))).status).toBe(404);
  });
  it('creates the deadline reminders at 08:00 Istanbul and a silence reminder; a new deadline replaces them', async () => {
    const p = await projeAc(a, { ...proje, title: 'Hatırlatmalı', deadline: '2026-11-20' });
    const satirlar = async () =>
      (await h.db.select().from(schema.reminders).where(eq(schema.reminders.projectId, p.id))).sort((x, y) =>
        x.kind.localeCompare(y.kind),
      );
    const ilk = await satirlar();
    // 2026-11-07 is 13 days before the deadline: the 14 day reminder is already past and is not created.
    expect(ilk.map((r) => r.kind)).toEqual(['sessizlik', 'teslim_0', 'teslim_1', 'teslim_3', 'teslim_7']);
    expect(ilk.find((r) => r.kind === 'teslim_7')?.nextAt?.toISOString()).toBe('2026-11-13T05:00:00.000Z');
    expect(ilk.find((r) => r.kind === 'teslim_0')?.nextAt?.toISOString()).toBe('2026-11-20T05:00:00.000Z');
    await projePatch(bag())(
      istek(`/v1/writing-projects/${p.id}`, a, { method: 'PATCH', json: { deadline: '2026-12-31' } }),
      rc(p.id),
    );
    const yeni = await satirlar();
    expect(yeni.map((r) => r.kind)).toEqual([
      'sessizlik',
      'teslim_0',
      'teslim_1',
      'teslim_14',
      'teslim_3',
      'teslim_7',
    ]);
    expect(yeni.filter((r) => r.kind === 'sessizlik')).toHaveLength(1);
    await projeDelete(bag())(istek(`/v1/writing-projects/${p.id}`, a, { method: 'DELETE' }), rc(p.id));
    expect(await satirlar()).toEqual([]);
  });
});

describe('daily progress (FR-48..50)', () => {
  it('adds words to the total and to the Istanbul day, and lists the last days', async () => {
    const p = await projeAc();
    const gece = bag({ now: () => new Date('2026-11-07T22:30:00Z') }); // 01:30 on the 8th in Istanbul
    const r = await ilerlemePost(gece)(
      istek(`/v1/writing-projects/${p.id}/progress`, a, { method: 'POST', json: { words: 400 } }),
      rc(p.id),
    );
    expect(r.status).toBe(201);
    await ilerlemePost(gece)(
      istek(`/v1/writing-projects/${p.id}/progress`, a, {
        method: 'POST',
        json: { words: 100, note: 'akşam' },
      }),
      rc(p.id),
    );
    const tek = await gov(await projeGet(gece)(istek(`/v1/writing-projects/${p.id}`, a), rc(p.id)));
    expect(tek.currentWords).toBe(500);
    expect(tek.recentLogs).toEqual([{ loggedOn: '2026-11-08', words: 500 }]);
  });
  it('rejects negative, huge and unknown fields', async () => {
    const p = await projeAc();
    for (const bad of [{ words: -1 }, { words: 100001 }, { words: 5, x: 1 }, {}]) {
      expect(
        (
          await ilerlemePost(bag())(
            istek(`/v1/writing-projects/${p.id}/progress`, a, { method: 'POST', json: bad }),
            rc(p.id),
          )
        ).status,
      ).toBe(400);
    }
  });
});

function cokluParca(ad: string, bayt: Uint8Array, dosyaAdi: string, ek: Record<string, string> = {}) {
  const f = new FormData();
  f.set(ad, new File([bayt as BlobPart], dosyaAdi));
  for (const [k, v] of Object.entries(ek)) f.set(k, v);
  return f;
}

describe('word count from a DOCX (FR-48)', () => {
  it('counts body and footnote words apart and does not store the file', async () => {
    const p = await projeAc();
    const docx = await sablonUret(varsayilanDegerler, 'tez');
    const r = await docxSayimiPost(bag())(
      istek(`/v1/writing-projects/${p.id}/docx-count`, a, {
        method: 'POST',
        body: cokluParca('file', docx, 'tez.docx'),
      }),
      rc(p.id),
    );
    expect(r.status).toBe(200);
    const s = await gov(r);
    expect(s.words).toBeGreaterThan(100);
    expect(s.footnoteWords).toBeGreaterThan(3);
    const kayitli = await h.db
      .select({ w: schema.writingProjects.currentWords })
      .from(schema.writingProjects)
      .where(eq(schema.writingProjects.id, p.id));
    expect(kayitli[0]?.w).toBe(0); // counting alone changes nothing
  });
  it('refuses a renamed file and a non DOCX; counts without touching project data', async () => {
    const p = await projeAc();
    const yol = `/v1/writing-projects/${p.id}/docx-count`;
    const pdf = new TextEncoder().encode('%PDF-1.4 sahte');
    expect(
      (
        await docxSayimiPost(bag())(
          istek(yol, a, { method: 'POST', body: cokluParca('file', pdf, 'a.docx') }),
          rc(p.id),
        )
      ).status,
    ).toBe(400);
    const docx = await sablonUret(varsayilanDegerler, 'tez');
    expect(
      (
        await docxSayimiPost(bag())(
          istek(yol, a, { method: 'POST', body: cokluParca('file', docx, 'a.txt') }),
          rc(p.id),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await docxSayimiPost(bag())(
          istek(yol, b, { method: 'POST', body: cokluParca('file', docx, 'a.docx') }),
          rc(p.id),
        )
      ).status,
    ).toBe(200); // the count reads no project data: another user's project id is no error and reveals nothing
    const yok = '00000000-0000-4000-8000-000000000000';
    const sayim = (id: string) =>
      docxSayimiPost(bag())(
        istek(`/v1/writing-projects/${id}/docx-count`, a, {
          method: 'POST',
          body: cokluParca('file', docx, 'a.docx'),
        }),
        rc(id),
      );
    expect((await sayim(yok)).status).toBe(200);
    expect((await sayim('degil')).status).toBe(404);
  });
  it('refuses a body whose declared length is over the cap before reading it', async () => {
    const p = await projeAc();
    const r = await docxSayimiPost(bag())(
      istek(`/v1/writing-projects/${p.id}/docx-count`, a, {
        method: 'POST',
        headers: {
          'content-length': String(25 * 1024 * 1024),
          'content-type': 'multipart/form-data; boundary=x',
        },
        body: 'x',
      }),
      rc(p.id),
    );
    expect(r.status).toBe(413);
  });
});

describe('Kalemcik form of address', () => {
  it('is sen until the user picks siz', async () => {
    expect((await gov(await ayarlarGet(bag())(istek('/v1/writing-projects/ayarlar', b)))).hitap).toBe('sen');
    const r = await ayarlarPut(bag())(
      istek('/v1/writing-projects/ayarlar', b, { method: 'PUT', json: { hitap: 'siz' } }),
    );
    expect(r.status).toBe(200);
    expect((await gov(await ayarlarGet(bag())(istek('/v1/writing-projects/ayarlar', b)))).hitap).toBe('siz');
    expect((await gov(await ayarlarGet(bag())(istek('/v1/writing-projects/ayarlar', a)))).hitap).toBe('sen');
    await ayarlarPut(bag())(
      istek('/v1/writing-projects/ayarlar', b, { method: 'PUT', json: { hitap: 'sen' } }),
    );
    expect((await gov(await ayarlarGet(bag())(istek('/v1/writing-projects/ayarlar', b)))).hitap).toBe('sen');
    expect(
      (
        await ayarlarPut(bag())(
          istek('/v1/writing-projects/ayarlar', b, { method: 'PUT', json: { hitap: 'sen', x: 1 } }),
        )
      ).status,
    ).toBe(400);
  });
});

describe('journal profiles (FR-39..42): only an editor approved version is public', () => {
  const kayit = (() => {
    const k = ornekKayit('makale');
    k.degerler.mLeft = 2;
    k.kaynaklar.mLeft = 'kilavuz';
    k.kanitlar.mLeft = { sayfa: 1, alinti: 'sol 2 cm' };
    return k;
  })();
  const taslak = (ad: string, issn: string) =>
    dergiTaslagiOlustur(h.db, {
      name: ad,
      issn,
      sourceUrl: 'https://dergipark.org.tr/tr/pub/ornek/writing-rules',
      kayit,
      model: 'haiku',
    });

  it('shows nothing before approval, in search and in rules', async () => {
    const t = await taslak('Örnek Hukuk Dergisi', '1111-1111');
    const ara = await gov(await dergilerGet(bag())(istek('/v1/journals?q=%C3%96rnek', null)));
    expect(ara).toEqual([
      { id: t.journalId, name: 'Örnek Hukuk Dergisi', issn: '1111-1111', hasApprovedRules: false },
    ]);
    expect((await dergiKurallariGet(bag())(istek(`/v1/journals/${t.journalId}/rules`, null))).status).toBe(
      404,
    );
  });
  it('puts the draft in the editor queue with its rules and evidence', async () => {
    const t = await taslak('Kuyruk Dergisi', '2222-2222');
    const [q] = await h.db
      .select()
      .from(schema.reviewQueueItems)
      .where(eq(schema.reviewQueueItems.subjectId, t.versionId));
    expect(q).toMatchObject({ queue: 'journal-rules', subjectType: 'journal_rule_version', decision: null });
    const payload = q?.payload as { rules: { kanitlar: { mLeft: { alinti: string } } }; model: string };
    expect(payload.model).toBe('haiku');
    expect(payload.rules.kanitlar.mLeft.alinti).toBe('sol 2 cm');
  });
  it('shows the rules once an editor decides onay, with the verbatim evidence', async () => {
    const t = await taslak('Onaylı Dergi', '3333-3333');
    const [editor] = await h.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, aId));
    await h.db
      .update(schema.reviewQueueItems)
      .set({ decision: 'onay', decidedBy: editor?.id, decidedAt: new Date('2026-11-07T09:00:00Z') })
      .where(eq(schema.reviewQueueItems.subjectId, t.versionId));
    const ara = await gov(await dergilerGet(bag())(istek('/v1/journals?q=3333', null)));
    expect(ara[0].hasApprovedRules).toBe(true);
    const r = await gov(await dergiKurallariGet(bag())(istek(`/v1/journals/${t.journalId}/rules`, null)));
    expect(r).toMatchObject({ id: t.versionId, version: 1, approvedAt: '2026-11-07T09:00:00.000Z' });
    const sol = r.rules.find((x: { key: string }) => x.key === 'mLeft');
    expect(sol).toEqual({ key: 'mLeft', value: 2, evidence: 'sol 2 cm' });
    expect(r.rules.find((x: { key: string }) => x.key === 'mRight').evidence).toBeNull(); // example value: no evidence
    expect(r.rules.find((x: { key: string }) => x.key === 'frontRoman')).toBeUndefined();
  });
  it('keeps a rejected draft hidden and serves the newest approved version', async () => {
    const t1 = await taslak('Sürümlü Dergi', '4444-4444');
    const t2 = await taslak('Sürümlü Dergi', '4444-4444');
    expect(t2).toMatchObject({ journalId: t1.journalId, version: 2 });
    await h.db
      .update(schema.reviewQueueItems)
      .set({ decision: 'onay', decidedAt: new Date() })
      .where(eq(schema.reviewQueueItems.subjectId, t1.versionId));
    await h.db
      .update(schema.reviewQueueItems)
      .set({ decision: 'ret', decidedAt: new Date() })
      .where(eq(schema.reviewQueueItems.subjectId, t2.versionId));
    const r = await gov(await dergiKurallariGet(bag())(istek(`/v1/journals/${t1.journalId}/rules`, null)));
    expect(r.version).toBe(1);
  });
  it('escapes search wildcards and rejects a long query', async () => {
    expect(await gov(await dergilerGet(bag())(istek('/v1/journals?q=%25', null)))).toEqual([]);
    expect((await dergilerGet(bag())(istek(`/v1/journals?q=${'a'.repeat(300)}`, null))).status).toBe(400);
    expect((await dergiKurallariGet(bag())(istek('/v1/journals/degil/rules', null))).status).toBe(404);
  });
});

const KILAVUZ_METNI = [
  'Yazım kuralları. Metin Times New Roman yazı tipinde ve 12 punto ile yazılır.',
  'Satır aralığı bir buçuk (1,5) olmalıdır.',
  'Kenar boşlukları: üst 3 cm, alt 2,5 cm, sol 3,5 cm ve sağ 2,5 cm olarak bırakılır.',
  'Sayfa numaraları alt orta konumda yer alır.',
  'Bu satırlar yalnızca uzunluğu 200 karakteri geçsin diye eklenmiştir ve kural içermez, başka bir amaç taşımaz.',
].join('\n');

const IYI_CEVAP = JSON.stringify({
  alanlar: {
    font: {
      deger: 'Times New Roman',
      sayfa: null,
      alinti: 'Metin Times New Roman yazı tipinde ve 12 punto ile yazılır.',
    },
    mLeft: { deger: 3.5, sayfa: null, alinti: 'sol 3,5 cm ve sağ 2,5 cm' },
    line: { deger: 2, sayfa: null, alinti: 'Satır aralığı bir buçuk (1,5) olmalıdır.' },
  },
});

function sahte(haiku: string, sonnet?: string): KuralModeli & { cagrilar: string[] } {
  const cagrilar: string[] = [];
  return {
    cagrilar,
    async tamamla({ model }) {
      cagrilar.push(model);
      const c = model === 'haiku' ? haiku : sonnet;
      if (c === undefined) throw new Error('yok');
      return c;
    },
  };
}

describe('guide upload and rule extraction (plan 10.5/2)', () => {
  const sinir = hizlar.kuralYukle.limit;
  beforeAll(() => {
    hizlar.kuralYukle.limit = 1000; // the cases below upload many times; the limit has its own test
  });
  afterAll(() => {
    hizlar.kuralYukle.limit = sinir;
  });
  const yukle = (
    token: string | null,
    model: KuralModeli | null,
    dosya: { bayt: Uint8Array; ad: string },
    ek: Record<string, string> = {},
    ust: Record<string, string> = {},
  ) =>
    kuralYuklePost(bag({ kuralModeli: () => model }))(
      istek('/v1/templates/rules', token, {
        method: 'POST',
        headers: ust,
        body: cokluParca('file', dosya.bayt, dosya.ad, ek),
      }),
    );
  const txt = (m: string) => ({ bayt: new TextEncoder().encode(m), ad: 'kilavuz.txt' });

  it('with the model service closed a valid file gets a job that fails closed, and no account is 401', async () => {
    const r = await yukle(a, null, txt(KILAVUZ_METNI));
    expect(r.status).toBe(202);
    const { jobId } = await gov(r);
    expect(await gov(await isGet()(istek(`/v1/jobs/${jobId}`, a), rc(jobId)))).toMatchObject({
      status: 'failed',
      error: 'yz_yok',
      result: null,
    });
    expect((await yukle(null, sahte(IYI_CEVAP), txt(KILAVUZ_METNI))).status).toBe(401);
  });
  it(
    'refuses hostile files with a 4xx whether or not the model service is open',
    { timeout: 60_000 },
    async () => {
      const { bombaDocx, cokGirdiliDocx, zipSlipDocx, xxeDocx } = await import('./_test/zip.ts');
      for (const model of [null, sahte(IYI_CEVAP)]) {
        for (const [ad, bayt] of [
          ['bomba.docx', bombaDocx()],
          ['cok.docx', cokGirdiliDocx()],
          ['slip.docx', zipSlipDocx()],
        ] as const) {
          const r = await yukle(a, model, { bayt: new Uint8Array(bayt), ad });
          expect([400, 413], ad).toContain(r.status);
        }
        const buyuk = await yukle(a, model, {
          bayt: new Uint8Array(21 * 1024 * 1024).fill(0x41),
          ad: 'buyuk.docx',
        });
        expect(buyuk.status).toBe(413);
        const xxe = await yukle(a, model, { bayt: new Uint8Array(xxeDocx()), ad: 'xxe.docx' });
        expect(xxe.status).toBeLessThan(500);
      }
    },
  );
  it('runs the job, stores rules with their quotes, and the owner can read, poll and delete them', async () => {
    const m = sahte(IYI_CEVAP);
    const r = await yukle(a, m, txt(KILAVUZ_METNI), { institutionName: 'Örnek Üniversitesi', kind: 'tez' });
    expect(r.status).toBe(202);
    const { jobId } = await gov(r);
    await bitir();
    const is = await gov(await isGet()(istek(`/v1/jobs/${jobId}`, a), rc(jobId)));
    expect(is).toMatchObject({ id: jobId, type: 'rules.extract', status: 'done', error: null });
    const [isSatiri] = await h.db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(isSatiri).toMatchObject({ maxAttempts: 1, status: 'done' });
    expect(m.cagrilar).toEqual(['haiku']);
    expect(is.result.model).toBe('haiku');
    expect(is.result.dusenler).toEqual([{ anahtar: 'line', neden: 'deger_alintida_yok' }]); // 2 is not in that excerpt
    const kuralId = is.result.templateRuleId as string;
    const k = await gov(await kuralGet()(istek(`/v1/templates/rules/${kuralId}`, a), rc(kuralId)));
    expect(k).toMatchObject({ tur: 'tez', institutionName: 'Örnek Üniversitesi' });
    expect(k.degerler.mLeft).toBe(3.5);
    expect(k.kaynaklar).toMatchObject({ mLeft: 'kilavuz', font: 'kilavuz', line: 'ornek', mTop: 'ornek' });
    expect(k.kanitlar.mLeft).toEqual({ sayfa: null, alinti: 'sol 3,5 cm ve sağ 2,5 cm' });
    const kanit = await h.db
      .select()
      .from(schema.templateRuleEvidence)
      .where(eq(schema.templateRuleEvidence.templateRuleId, kuralId));
    expect(kanit.map((x) => x.ruleKey).sort()).toEqual(['font', 'mLeft']);
    const [satir] = await h.db
      .select()
      .from(schema.templateRules)
      .where(eq(schema.templateRules.id, kuralId));
    expect(satir).toMatchObject({ userId: aId, approved: false, model: 'haiku', sourceObjectKey: null });
    expect(
      (await kuralDelete()(istek(`/v1/templates/rules/${kuralId}`, a, { method: 'DELETE' }), rc(kuralId)))
        .status,
    ).toBe(204);
    expect((await kuralGet()(istek(`/v1/templates/rules/${kuralId}`, a), rc(kuralId))).status).toBe(404);
    const sonra = await h.db
      .select()
      .from(schema.templateRuleEvidence)
      .where(eq(schema.templateRuleEvidence.templateRuleId, kuralId));
    expect(sonra).toEqual([]);
  });
  it('keeps the file out of the job row and out of storage', async () => {
    const r = await gov(await yukle(a, sahte(IYI_CEVAP), txt(KILAVUZ_METNI)));
    await bitir();
    const [is] = await h.db.select().from(schema.jobs).where(eq(schema.jobs.id, r.jobId));
    expect(is?.payload).toEqual({ userId: aId, kind: 'tez' });
    expect(JSON.stringify(is)).not.toContain('Times New Roman yazı tipinde');
  });
  it('does not let another user read, poll or delete the job and rules', async () => {
    const { jobId } = await gov(await yukle(a, sahte(IYI_CEVAP), txt(KILAVUZ_METNI)));
    await bitir();
    const is = await gov(await isGet()(istek(`/v1/jobs/${jobId}`, a), rc(jobId)));
    const kuralId = is.result.templateRuleId as string;
    expect((await isGet()(istek(`/v1/jobs/${jobId}`, b), rc(jobId))).status).toBe(404);
    expect((await kuralGet()(istek(`/v1/templates/rules/${kuralId}`, b), rc(kuralId))).status).toBe(404);
    expect(
      (await kuralDelete()(istek(`/v1/templates/rules/${kuralId}`, b, { method: 'DELETE' }), rc(kuralId)))
        .status,
    ).toBe(404);
  });
  it('falls back to Sonnet only when Haiku fails the schema', async () => {
    const m = sahte('bu bir json değil', IYI_CEVAP);
    const { jobId } = await gov(await yukle(a, m, txt(KILAVUZ_METNI)));
    await bitir();
    const is = await gov(await isGet()(istek(`/v1/jobs/${jobId}`, a), rc(jobId)));
    expect(m.cagrilar).toEqual(['haiku', 'sonnet']);
    expect(is.result).toMatchObject({ model: 'sonnet', sonnetYedegi: true });
  });
  it('closes the job as failed with a stable code when both answers fail the schema', async () => {
    const { jobId } = await gov(await yukle(a, sahte('x', 'y'), txt(KILAVUZ_METNI)));
    await bitir();
    expect(await gov(await isGet()(istek(`/v1/jobs/${jobId}`, a), rc(jobId)))).toMatchObject({
      status: 'failed',
      error: 'sema',
      result: null,
    });
  });
  it('does not spend a model call on a file with almost no text and reports the scan warning', async () => {
    const m = sahte(IYI_CEVAP);
    const { jobId } = await gov(await yukle(a, m, txt('kısa metin')));
    await bitir();
    const is = await gov(await isGet()(istek(`/v1/jobs/${jobId}`, a), rc(jobId)));
    expect(m.cagrilar).toEqual([]);
    expect(is).toMatchObject({ status: 'done', result: { templateRuleId: null, uyarilar: ['metin_az'] } });
  });
  it('refuses wrong file types, renamed files and bad kinds before any job exists', async () => {
    const onceki = (await h.db.select().from(schema.jobs)).length;
    expect((await yukle(a, sahte(IYI_CEVAP), { bayt: new Uint8Array([1, 2, 3]), ad: 'a.exe' })).status).toBe(
      400,
    );
    expect(
      (await yukle(a, sahte(IYI_CEVAP), { bayt: new TextEncoder().encode('%PDF-1.4 x'), ad: 'a.txt' }))
        .status,
    ).toBe(400);
    expect((await yukle(a, sahte(IYI_CEVAP), txt(KILAVUZ_METNI), { kind: 'odev' })).status).toBe(400);
    expect((await h.db.select().from(schema.jobs)).length).toBe(onceki);
  });
  it('answers an Idempotency-Key repeat with the same job and runs it once', async () => {
    const m = sahte(IYI_CEVAP);
    const ust = { 'idempotency-key': 'ayni-istek-1' };
    const r1 = await gov(await yukle(a, m, txt(KILAVUZ_METNI), {}, ust));
    const r2 = await gov(await yukle(a, m, txt(KILAVUZ_METNI), {}, ust));
    await bitir();
    expect(r2.jobId).toBe(r1.jobId);
    expect(m.cagrilar).toEqual(['haiku']);
  });
});

describe('upload rate limit', () => {
  it('stops the sixth upload within an hour for the same user', async () => {
    const c = (await signUp('yazar-c@example.invalid')).token;
    const yolla = () =>
      kuralYuklePost(bag({ kuralModeli: () => sahte(IYI_CEVAP) }))(
        istek('/v1/templates/rules', c, {
          method: 'POST',
          body: cokluParca('file', new TextEncoder().encode(KILAVUZ_METNI), 'k.txt'),
        }),
      );
    const kodlar: number[] = [];
    for (let i = 0; i < 6; i++) kodlar.push((await yolla()).status);
    await bitir();
    expect(kodlar).toEqual([202, 202, 202, 202, 202, 429]);
  });
});

describe('table of abbreviations endpoint (FR-91)', () => {
  const gonder = (token: string | null, json: unknown, o: Partial<Bagimliliklar> = {}) =>
    kisaltmalarPost(bag(o))(istek('/v1/abbreviations', token, { method: 'POST', json }));
  const METIN = 'Türk Borçlar Kanunu (TBK) m. 49 ve AYM kararı; ABC protokolü.';

  it('needs an account and validates input', async () => {
    expect((await gonder(null, { text: METIN })).status).toBe(401);
    expect((await gonder(a, { text: 5 })).status).toBe(400);
    expect((await gonder(a, { text: 'x'.repeat(200_001) })).status).toBe(400);
    expect((await gonder(a, { text: 'x', ekstra: 1 })).status).toBe(400);
  });
  it('returns an alphabetical list with the source of every row', async () => {
    const r = await gonder(a, { text: METIN });
    expect(r.status).toBe(200);
    const liste = (await gov(r)) as { short: string; long: string; source: string }[];
    expect(liste.map((x) => x.short)).toEqual(['ABC', 'AYM', 'm.', 'TBK']);
    expect(liste.find((x) => x.short === 'TBK')).toMatchObject({
      long: 'Türk Borçlar Kanunu',
      source: 'metin',
    });
    expect(liste.find((x) => x.short === 'ABC')).toMatchObject({ long: '', source: 'belirsiz' });
    expect(r.headers.get('x-yazma-oneri')).toBeNull();
  });
  it('sends only the abbreviations to the model, never the text, and says when suggestions are closed', async () => {
    const gorulen: string[][] = [];
    const r = await gonder(
      a,
      { text: METIN, useAi: true },
      { kisaltmaModeli: () => ({ oner: async (k) => (gorulen.push(k), { ABC: 'Örnek Cetvel' }) }) },
    );
    expect(gorulen).toEqual([['ABC']]);
    expect((await gov(r)).find((x: { short: string }) => x.short === 'ABC')).toMatchObject({
      long: 'Örnek Cetvel',
      source: 'oneri',
    });
    const kapali = await gonder(a, { text: METIN, useAi: true });
    expect(kapali.status).toBe(200);
    expect(kapali.headers.get('x-yazma-oneri')).toBe('kapali');
  });
});

describe('DOCX check endpoint', () => {
  const kurallar = JSON.stringify({ tur: 'tez', degerler: varsayilanDegerler });
  const gonder = async (
    token: string | null,
    o: Partial<Bagimliliklar>,
    bayt?: Uint8Array,
    ad = 'tez.docx',
    rules = kurallar,
  ) =>
    denetimPost(bag(o))(
      istek('/v1/templates/check', token, {
        method: 'POST',
        body: cokluParca('file', bayt ?? (await sablonUret(varsayilanDegerler, 'tez')), ad, { rules }),
      }),
    );

  it('is closed (503) without the check service, and needs an account', async () => {
    expect((await gonder(a, {})).status).toBe(503);
    expect((await gonder(null, { denetim: () => async () => ({ durum: 200, govde: {} }) })).status).toBe(401);
  });
  it('forwards the bytes and the rules without notes and institution, and returns the report as is', async () => {
    const gorulen: { bayt: number; tur: string; kurallar: Record<string, unknown> }[] = [];
    const rapor = { kind: 'tez', summary: { uygun: 3 }, findings: [] };
    const docx = await sablonUret(varsayilanDegerler, 'tez');
    const r = await gonder(
      a,
      {
        denetim: () => async (bayt, tur, k) => (
          gorulen.push({ bayt: bayt.length, tur, kurallar: denetimKurallari(k) }),
          { durum: 200, govde: rapor }
        ),
      },
      docx,
    );
    expect(r.status).toBe(200);
    expect(await gov(r)).toEqual(rapor);
    expect(gorulen[0]?.bayt).toBe(docx.length);
    expect(gorulen[0]?.tur).toBe('tez');
    expect(gorulen[0]?.kurallar).not.toHaveProperty('notes');
    expect(gorulen[0]?.kurallar).not.toHaveProperty('institution');
    expect(gorulen[0]?.kurallar).toHaveProperty('mLeft', 3.5);
  });
  it('refuses non DOCX files, invalid rules and maps checker failures without leaking them', async () => {
    const ok = { denetim: () => async () => ({ durum: 200, govde: {} }) };
    expect((await gonder(a, ok, new TextEncoder().encode('%PDF-1.4'), 'a.docx')).status).toBe(400);
    expect((await gonder(a, ok, undefined, 'a.pdf')).status).toBe(400);
    expect((await gonder(a, ok, undefined, 'tez.docx', 'bozuk')).status).toBe(400);
    expect(
      (await gonder(a, ok, undefined, 'tez.docx', JSON.stringify({ tur: 'tez', degerler: { mTop: 99 } })))
        .status,
    ).toBe(400);
    expect((await gonder(a, { denetim: () => async () => ({ durum: 413, govde: null }) })).status).toBe(413);
    expect((await gonder(a, { denetim: () => async () => ({ durum: 422, govde: null }) })).status).toBe(400);
    expect((await gonder(a, { denetim: () => async () => ({ durum: 500, govde: null }) })).status).toBe(503);
    const dusen = await gonder(a, {
      denetim: () => async () => {
        throw new Error('ECONNREFUSED http://10.0.0.5:8000');
      },
    });
    expect(dusen.status).toBe(503);
    expect(await dusen.text()).not.toContain('10.0.0.5');
  });
});
