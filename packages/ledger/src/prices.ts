/**
 * Versioned price tables (plan 4.2, 4.3, 4.4, 9.4). Prices are VAT included, in kurus. Values are the
 * plan's proposal and await Tarik's approval; a new version with a later effectiveFrom replaces them.
 */
export type ProductKind = 'paket' | 'abonelik';

export interface PriceProduct {
  code: string;
  kind: ProductKind;
  priceKurus: number;
  credits: number | null;
  monthlyCredits: number | null;
  interval: 'aylik' | 'yillik' | null;
  /** Monthly list price used by the annual refund formula (4.5/7). */
  monthlyListKurus: number | null;
}

export interface PriceTable {
  version: string;
  effectiveFrom: Date;
  products: PriceProduct[];
  operations: Record<string, number>;
}

export const PRICE_TABLE_V1: PriceTable = {
  version: '2026-10-v1',
  effectiveFrom: new Date('2026-10-19T00:00:00Z'),
  products: [
    {
      code: 'kredi.300',
      kind: 'paket',
      priceKurus: 3900,
      credits: 300,
      monthlyCredits: null,
      interval: null,
      monthlyListKurus: null,
    },
    {
      code: 'kredi.1000',
      kind: 'paket',
      priceKurus: 10900,
      credits: 1000,
      monthlyCredits: null,
      interval: null,
      monthlyListKurus: null,
    },
    {
      code: 'kredi.3000',
      kind: 'paket',
      priceKurus: 29900,
      credits: 3000,
      monthlyCredits: null,
      interval: null,
      monthlyListKurus: null,
    },
    {
      code: 'ogrenci.aylik',
      kind: 'abonelik',
      priceKurus: 9900,
      credits: null,
      monthlyCredits: 1000,
      interval: 'aylik',
      monthlyListKurus: 9900,
    },
    {
      code: 'ogrenci.yillik',
      kind: 'abonelik',
      priceKurus: 79900,
      credits: null,
      monthlyCredits: 1000,
      interval: 'yillik',
      monthlyListKurus: 9900,
    },
    {
      code: 'akademisyen.aylik',
      kind: 'abonelik',
      priceKurus: 24900,
      credits: null,
      monthlyCredits: 3000,
      interval: 'aylik',
      monthlyListKurus: 24900,
    },
    {
      code: 'akademisyen.yillik',
      kind: 'abonelik',
      priceKurus: 199000,
      credits: null,
      monthlyCredits: 3000,
      interval: 'yillik',
      monthlyListKurus: 24900,
    },
  ],
  operations: {
    'ozet.standart': 2,
    'ozet.derin': 60,
    'sablon.kilavuz': 30,
    'kampus.ozet': 3,
    'kampus.poster': 4,
    'kisaltma.cetvel': 2,
    'kart.taslak': 1,
  },
};

/** The table in force at `at`: latest effectiveFrom not after `at`. */
export function effectiveTable(tables: readonly PriceTable[], at: Date): PriceTable | null {
  let best: PriceTable | null = null;
  for (const t of tables)
    if (t.effectiveFrom.getTime() <= at.getTime() && (!best || t.effectiveFrom > best.effectiveFrom))
      best = t;
  return best;
}

export function findProduct(table: PriceTable, code: string): PriceProduct | null {
  return table.products.find((p) => p.code === code) ?? null;
}

/** Public JSON shape of contracts PriceTable. */
export function toPublicPriceTable(t: PriceTable) {
  return {
    version: t.version,
    effectiveFrom: t.effectiveFrom.toISOString(),
    products: t.products.map((p) => ({
      code: p.code,
      priceKurus: p.priceKurus,
      credits: p.credits ?? p.monthlyCredits,
    })),
    operations: { ...t.operations },
  };
}
