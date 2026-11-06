import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ortak } from '@kazuist/i18n';
import { kunye } from '../_kabuk/kunye.ts';
import { islemler, paketler, planlar } from './fiyatlar.ts';

const kok = (p: string) => fileURLToPath(new URL(`../../../../../../${p}`, import.meta.url));
const plan = readFileSync(kok('plan.md'), 'utf8');
const duz = (s: string) => s.replace(/[‘’]/g, "'").trim();
/**
 * Plan 4.4 rows of Turkuaz Kampus operations. ADR-0031 removed the product, so the public price list
 * omits them until plan.md 4.4 drops them too (docs/istekler/on-yuz-kampus-temizligi.md).
 */
const adr0031Kaldirilan = new Set(['Kampüs YZ özeti', 'Poster taslağı']);

/** Rows of the first Markdown table after a heading, without the header and separator rows. */
function tablo(baslik: string): string[][] {
  const bas = plan.indexOf(baslik);
  expect(bas, baslik).toBeGreaterThan(-1);
  const satirlar = plan.slice(bas).split('\n');
  const ilk = satirlar.findIndex((s) => s.startsWith('|'));
  const son = satirlar.findIndex((s, i) => i > ilk && !s.startsWith('|'));
  return satirlar.slice(ilk + 2, son).map((s) => s.slice(1, -1).split('|').map(duz));
}

describe('/fiyatlar matches plan.md 4.2-4.4 (approved 2026-10-20)', () => {
  it('plans', () => {
    expect(planlar.map((p) => [p.ad, p.kime, p.fiyat, p.kredi, p.ozellik].map(duz))).toEqual(
      tablo('### 4.2 Planlar'),
    );
  });
  it('credit packages', () => {
    expect(paketler.map((p) => [p.ad, p.kredi, p.fiyat, p.krediBasi])).toEqual(
      tablo('### 4.3 Kredi paketleri'),
    );
  });
  it('credits per operation', () => {
    expect(islemler.map((p) => [p.ad, p.kredi])).toEqual(
      tablo('### 4.4 İşlem fiyatları')
        .filter((r) => !adr0031Kaldirilan.has(r[0] ?? ''))
        .map((r) => [r[0], r[4]]),
    );
  });
  it('the draft note is gone and VAT is stated', () => {
    for (const dil of ['tr', 'en'] as const) {
      expect(ortak(dil).fiyatlar).not.toHaveProperty('taslak');
      expect(ortak(dil).fiyatlar.kdv.length).toBeGreaterThan(0);
    }
  });
});

describe('company particulars', () => {
  it('are approved and match the archived /tr/hakkinda page', () => {
    expect(kunye.dogrulandi).toBe(true);
    expect(kunye.eposta).toBe('teknoloji@kulular.com');
    expect(kunye.telefon).toBe('+90 505 781 48 46');
    const arsiv = readFileSync(kok('docs/tasarim/casuist-arsiv/tr_hakkinda.html'), 'utf8');
    for (const v of [kunye.tamUnvan, kunye.mersis, '550123', 'Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16']) {
      expect(arsiv, v).toContain(v);
    }
  });
});
