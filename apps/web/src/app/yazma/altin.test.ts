import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  alintiyiBul,
  degerAlintidaVarMi,
  kuralCikar,
  normallestir,
  type KuralModeli,
} from './_cekirdek/kural-cikarma.ts';
import type { KuralAnahtari } from './_cekirdek/kural-semasi.ts';

/**
 * The gold labels of eval/rules are checked against the real guide texts in CI: every quote is verbatim in the
 * guide and states its value, and the extraction pipeline accepts them. This is not a model measurement
 * (eval/rules/olc.ts --mod=canli is); it keeps the labels honest.
 */

const klasor = (ad: string) => fileURLToPath(new URL(`../../../../../eval/rules/${ad}/`, import.meta.url));
interface Altin {
  kilavuz: string;
  tur: 'tez' | 'makale';
  alanlar: Record<string, { deger?: unknown; anahtar?: string; alinti: string }>;
  bos: string[];
}
const altinlar: Altin[] = readdirSync(klasor('altin'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`${klasor('altin')}${f}`, 'utf8')) as Altin);
const metin = (ad: string) =>
  readFileSync(`${klasor('kilavuz')}${ad}.txt`, 'utf8')
    .split('\n')
    .filter((s) => !s.startsWith('# '))
    .join('\n')
    .trim();

describe('eval/rules gold labels', () => {
  it('has five real guides, each with a source line and a fetch date', () => {
    expect(altinlar.map((a) => a.kilavuz).sort()).toEqual(['auhfd', 'sduhfd', 'tauhfd', 'toguhfd', 'yuhfd']);
    for (const a of altinlar) {
      const ham = readFileSync(`${klasor('kilavuz')}${a.kilavuz}.txt`, 'utf8');
      expect(ham).toMatch(/^# Kaynak: https:\/\/dergipark\.org\.tr\/tr\/pub\/[a-z]+\/writing-rules$/m);
      expect(ham).toMatch(/^# Alındığı tarih: 2026-11-07/m);
      expect(ham.length).toBeGreaterThan(3000);
    }
  });
  for (const a of altinlar) {
    describe(a.kilavuz, () => {
      const sayfalar = [{ sayfa: null, metin: metin(a.kilavuz) }];
      const normaller = [normallestir(sayfalar[0]?.metin ?? '')];
      it('quotes every gold field verbatim and the quote states the value', () => {
        for (const [k, v] of Object.entries(a.alanlar)) {
          const b = alintiyiBul(sayfalar, normaller, v.alinti, null);
          expect(b, `${k} quote not found`).not.toBeNull();
          if (k !== 'citation')
            expect(
              degerAlintidaVarMi(k as KuralAnahtari, v.deger, b?.alinti ?? ''),
              `${k} value not in quote`,
            ).toBe(true);
          else expect(normallestir(b?.alinti ?? '').norm).toContain(v.anahtar ?? '(yok)');
        }
      });
      it('lets the pipeline keep exactly the gold fields as "Kılavuzdan" and nothing for the empty ones', async () => {
        const alanlar: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(a.alanlar))
          alanlar[k] = {
            deger:
              k === 'citation'
                ? v.anahtar === 'chicago'
                  ? 'Chicago 18. baskı'
                  : 'OSCOLA 4. Edisyon'
                : v.deger,
            sayfa: null,
            alinti: v.alinti,
          };
        const model: KuralModeli = { tamamla: async () => JSON.stringify({ alanlar }) };
        const r = await kuralCikar(sayfalar, a.tur, model);
        expect(r.dusenler).toEqual([]);
        for (const k of Object.keys(a.alanlar))
          expect(r.kayit.kaynaklar[k as KuralAnahtari], k).toBe('kilavuz');
        for (const k of a.bos) expect(r.kayit.kaynaklar[k as KuralAnahtari], k).toBe('ornek');
      });
      it('drops an invented margin for a field the guide does not state', async () => {
        const model: KuralModeli = {
          tamamla: async () =>
            JSON.stringify({
              alanlar: {
                pageNum: {
                  deger: 'alt-orta',
                  sayfa: null,
                  alinti: 'Sayfa numaraları alt orta konumda yer alır.',
                },
                mLeft: { deger: 4, sayfa: null, alinti: 'Sol kenar boşluğu 4 cm olmalıdır.' },
              },
            }),
        };
        const r = await kuralCikar(sayfalar, a.tur, model);
        if (!('mLeft' in a.alanlar)) expect(r.kayit.kaynaklar.mLeft).toBe('ornek');
        if (!('pageNum' in a.alanlar)) expect(r.kayit.kaynaklar.pageNum).toBe('ornek');
        expect(r.dusenler.map((d) => d.neden)).toContain('alinti_bulunamadi');
      });
    });
  }
});
