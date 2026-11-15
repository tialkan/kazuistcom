import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// The line validator and the künye writer are casuist's; they are read here only to keep the instruction in step
// with what is enforced (no package dependency, same pattern as eval/rag and tests/security).
import { passagesFromPrompt, kunye, SECTION_LABELS } from '../../casuist/src/answer/passages.ts';
import {
  createLineValidator,
  MIN_QUOTE_CHARS,
  type LineVerdict,
} from '../../casuist/src/answer/validator.ts';
import { CHUNK_SECTIONS, NON_BINDING_SECTIONS, type ChunkSection } from '../../casuist/src/chunk.ts';
import type { CorpusRecord } from '../../casuist/src/types.ts';
import { SOURCED_SUMMARY_SYSTEM, buildSourcedPrompt, type Passage } from '../src/prompt.ts';

/** The fenced block under "### D.1 Sistem talimatı" in plan.md. */
function ekD1(): string[] {
  const plan = readFileSync(new URL('../../../plan.md', import.meta.url), 'utf8');
  const at = plan.indexOf('### D.1 Sistem talimatı');
  expect(at, 'plan.md has Ek D.1').toBeGreaterThan(0);
  const open = plan.indexOf('```text\n', at) + '```text\n'.length;
  const close = plan.indexOf('\n```', open);
  return plan
    .slice(open, close)
    .split('\n')
    .filter((l) => l.trim());
}

const rules = (): string[] => SOURCED_SUMMARY_SYSTEM.split('\n').filter((l) => /^\d+\. /.test(l));

describe('SOURCED_SUMMARY_SYSTEM follows plan Ek D.1', () => {
  it('contains every line of Ek D.1 verbatim, rule 2 as worded after PR #102', () => {
    const lines = ekD1();
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) expect(SOURCED_SUMMARY_SYSTEM, line).toContain(line);
  });

  it('keeps the nine rules of Ek D.1 in their order, so rule numbers cited elsewhere stay valid', () => {
    expect(rules().map((l) => Number(l.split('.')[0]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const plan = ekD1().filter((l) => /^\d+\. /.test(l));
    rules().forEach((l, i) => expect(l.startsWith(plan[i] ?? '\u0000'), `rule ${i + 1}`).toBe(true));
  });

  it('ends with the JSON Lines output format and nothing after it', () => {
    expect(SOURCED_SUMMARY_SYSTEM.endsWith('{"t":"son"}')).toBe(true);
  });
});

describe('SOURCED_SUMMARY_SYSTEM tells the model every rule of the line validator', () => {
  const rule = (n: number): string => rules()[n - 1] ?? '';

  it(`quotes are at least MIN_QUOTE_CHARS (${MIN_QUOTE_CHARS}) characters`, () => {
    expect(rule(2)).toContain(`Alıntı en az ${MIN_QUOTE_CHARS} karakter olsun`);
  });

  it('quotes come from the passage body, and the model is told which line is the künye', () => {
    expect(rule(2)).toContain('künye satırından değil pasaj gövdesinden alınsın');
    expect(SOURCED_SUMMARY_SYSTEM).toContain('Her <kaynak> bloğunun ilk satırı künyedir');
    expect(SOURCED_SUMMARY_SYSTEM).toContain('Künyeden sonraki satırlar pasaj gövdesidir.');
    // The künye paragraph comes before the rules that refer to it.
    expect(SOURCED_SUMMARY_SYSTEM.indexOf('ilk satırı künyedir')).toBeLessThan(
      SOURCED_SUMMARY_SYSTEM.indexOf('Kurallar:'),
    );
  });

  it('the sentence keeps the negation of its quote (reason olumsuzluk)', () => {
    expect(rule(2)).toContain('cümle alıntıdaki olumsuzluğu (değil, -maz/-mez) korusun');
  });

  it('numbers in digits or words need the same value and unit in a cited passage', () => {
    expect(rule(3)).toContain('Rakamla ya da yazıyla yazdığın her sayı, tarih, süre ve tutar');
    expect(rule(3)).toContain('o cümlede kaynak gösterdiğin bir pasajda geçsin');
    expect(rule(3)).toContain('değer ve birim aynı olsun');
    expect(rule(3)).toContain(
      '"on beş gün" için "15 gün" yazılabilir, "otuz gün" ya da "on beş iş günü" yazılamaz',
    );
  });

  it('claims, procedural history and dissents never bind on their own, named by their künye mark', () => {
    for (const s of CHUNK_SECTIONS) {
      const mark = `"(Bölüm: ${SECTION_LABELS[s]})"`;
      if (NON_BINDING_SECTIONS.has(s)) expect(rule(6), s).toContain(mark);
      else expect(SOURCED_SUMMARY_SYSTEM, s).not.toContain(mark);
    }
    expect(rule(6)).toContain('bağlayıcı kaynaktan gelse de hükmü tek başına kurmaz');
    expect(rule(6)).toContain('Böyle bir pasaja dayanan cümlede bunu açıkça söyle');
  });

  it('the section marks named in the prompt are the ones casuist writes into the künye line', () => {
    const record = {
      type: 'karar',
      title: 'Örnek Daire E. 2020/1 K. 2021/2',
      date: '2021-03-04',
      normRefs: [],
    } as unknown as CorpusRecord;
    for (const s of NON_BINDING_SECTIONS as ReadonlySet<ChunkSection>) {
      const mark = /\(Bölüm: [^()]+\)$/u.exec(kunye(record, s))?.[0];
      expect(mark, s).toBeDefined();
      expect(SOURCED_SUMMARY_SYSTEM, s).toContain(`"${mark}"`);
    }
  });

  it('abstention stays the only output when the sources do not answer', () => {
    expect(rule(9)).toBe('9. Kaynaklar soruyu karşılamıyorsa yalnız yetersiz satırını yaz.');
  });
});

describe('the examples in the prompt are what the validator enforces', () => {
  const record = (type: 'mevzuat' | 'karar', title: string): CorpusRecord =>
    ({ type, title, date: '2021-03-04', normRefs: [] }) as unknown as CorpusRecord;
  const passage = (
    id: string,
    head: string,
    body: string,
    authority: Passage['authority'],
    type: Passage['type'],
  ): Passage => ({
    id,
    type,
    authority,
    status: 'yururlukte',
    date: '2021-03-04',
    dataDay: '2026-11-14',
    text: `${head}\n${body}`,
  });
  const law = passage(
    'K1',
    kunye(record('mevzuat', 'Örnek Kira ve Kullanım Kanunu')),
    'Kiracı, kira bedelini her ayın sonunda ödemekle yükümlüdür. Bildirim on beş gün içinde yapılır. ' +
      'Sözleşme yazılı şekilde yapılmadıkça geçerli olmaz.',
    'baglayici_norm',
    'mevzuat',
  );
  const dissent = passage(
    'K2',
    kunye(record('karar', 'Örnek Daire E. 2020/1 K. 2021/2'), 'karsi_oy'),
    'Kira artışının hakkaniyete uygun olmadığı görüşündeyim.',
    'baglayici_karar',
    'karar',
  );
  const reasoning = passage(
    'K3',
    kunye(record('karar', 'Örnek Daire E. 2020/1 K. 2021/2'), 'gerekce'),
    'Kira bedelinin tespitinde emsal kira bedelleri dikkate alınır.',
    'baglayici_karar',
    'karar',
  );
  // The BYOK client and /v1/answers/verify read the passages back from the prompt the gateway builds.
  const prompt = buildSourcedPrompt('Kira bedeli nasıl belirlenir?', [law, dissent, reasoning]);
  const check = (metin: string, k: string, alinti: string): Promise<LineVerdict> =>
    createLineValidator(passagesFromPrompt(prompt), { now: new Date('2026-11-15T12:00:00Z') }).check(
      JSON.stringify({ t: 'cumle', metin, kaynaklar: [k], alinti: { [k]: alinti } }),
    );
  const reason = (v: LineVerdict): string => (v.ok ? 'ok' : v.reason);

  it('the künye line and its section mark survive the prompt and are read back', () => {
    const back = passagesFromPrompt(prompt);
    expect(back.map((p) => p.section ?? null)).toEqual([null, 'karsi_oy', 'gerekce']);
    expect(back[1]?.text.split('\n')[0]).toMatch(/\(Bölüm: karşı oy\)$/u);
  });

  it('rule 2: a body quote of the minimum length passes, a shorter one or one from the künye does not', async () => {
    const short = 'bedelini her ayın';
    expect(short.length).toBeLessThan(MIN_QUOTE_CHARS);
    expect(reason(await check('Kira bedeli her ayın sonunda ödenir.', 'K1', short))).toBe('alinti_kisa');
    const head = law.text.split('\n')[0] ?? '';
    expect(head.length).toBeGreaterThanOrEqual(MIN_QUOTE_CHARS);
    expect(reason(await check('Kanun kirayı düzenler.', 'K1', head))).toBe('alinti_bulunamadi');
    expect(
      reason(
        await check(
          'Kiracı, kira bedelini her ayın sonunda öder.',
          'K1',
          'kira bedelini her ayın sonunda ödemekle',
        ),
      ),
    ).toBe('ok');
  });

  it('rule 2: dropping the quoted negation is rejected, keeping it passes', async () => {
    const q = 'yazılı şekilde yapılmadıkça geçerli olmaz';
    expect(reason(await check('Sözleşme yazılı şekilde yapılmadıkça geçerli olmaz.', 'K1', q))).toBe('ok');
    expect(reason(await check('Sözleşme yazılı şekilde yapıldığında geçerli olur.', 'K1', q))).toBe(
      'olumsuzluk',
    );
  });

  it('rule 3: "15 gün" stands for "on beş gün", "otuz gün" and "on beş iş günü" do not', async () => {
    const q = 'Bildirim on beş gün içinde yapılır';
    expect(reason(await check('Bildirim 15 gün içinde yapılır.', 'K1', q))).toBe('ok');
    expect(reason(await check('Bildirim otuz gün içinde yapılır.', 'K1', q))).toBe('dayanaksiz_sayi');
    expect(reason(await check('Bildirim on beş iş günü içinde yapılır.', 'K1', q))).toBe('dayanaksiz_sayi');
  });

  it('rule 6: a dissent of a binding decision is shown as supporting only, its reasoning binds', async () => {
    const d = await check(
      'Karşı oyda kira artışının hakkaniyete uygun olmadığı belirtilmiştir.',
      'K2',
      'Kira artışının hakkaniyete uygun olmadığı',
    );
    expect(d.ok && d.kind === 'cumle' && d.sentence.destekleyici).toBe(true);
    const g = await check(
      'Kira bedelinin tespitinde emsal kira bedelleri dikkate alınır.',
      'K3',
      'emsal kira bedelleri dikkate alınır',
    );
    expect(g.ok && g.kind === 'cumle' && g.sentence.destekleyici).toBe(false);
  });
});
