/**
 * e-Arsiv invoice abstraction (9.2/7). The integrator is chosen with the accountant (VUK 509); until then
 * FakeEArsiv issues sequential numbers in memory. Amounts are VAT included kurus.
 */
export interface EArsivInvoiceInput {
  orderId: string;
  userId: string;
  kind: 'satis' | 'iade';
  totalKurus: number;
  description: string;
  buyerEmail: string;
  /** Internet sale fields required by e-Arsiv for online sales. */
  internetSale: { webAddress: string; paymentMethod: 'kart'; paymentAgent: 'iyzico'; paidAt: Date };
}
export interface EArsivInvoice {
  number: string;
  providerRef: string;
  issuedAt: Date;
  pdfObjectKey: string | null;
}
export interface EArsivProvider {
  issue(input: EArsivInvoiceInput): Promise<EArsivInvoice>;
  cancel(providerRef: string): Promise<void>;
}

export class FakeEArsiv implements EArsivProvider {
  readonly issued: (EArsivInvoiceInput & EArsivInvoice)[] = [];
  readonly canceled: string[] = [];
  private n = 0;
  constructor(private readonly now: () => Date = () => new Date()) {}

  async issue(input: EArsivInvoiceInput): Promise<EArsivInvoice> {
    const issuedAt = this.now();
    const number = `KZA${issuedAt.getUTCFullYear()}${String(++this.n).padStart(9, '0')}`;
    const inv = { number, providerRef: `fake-${number}`, issuedAt, pdfObjectKey: null };
    this.issued.push({ ...input, ...inv });
    return inv;
  }

  async cancel(providerRef: string): Promise<void> {
    this.canceled.push(providerRef);
  }
}

export class EArsivUnavailable extends Error {
  override name = 'EArsivUnavailable';
}

/**
 * Production stand-in until the integrator is chosen (D5): never invents an invoice number. The billing
 * service records an alert (fatura_bekliyor) and the payment itself is not affected.
 */
export class UnconfiguredEArsiv implements EArsivProvider {
  async issue(): Promise<EArsivInvoice> {
    throw new EArsivUnavailable();
  }
  async cancel(): Promise<void> {
    throw new EArsivUnavailable();
  }
}
