/** Daily reconciliation (9.2/5): provider report against recorded payments and refunds. */
export interface ReconLine {
  paymentId: string;
  kind: 'odeme' | 'iade';
  amountKurus: number;
}
export interface ReconDiff {
  paymentId: string;
  kind: 'odeme' | 'iade';
  problem: 'saglayicida_yok' | 'kayitta_yok' | 'tutar_farki';
  providerKurus: number | null;
  recordedKurus: number | null;
}

export function reconcile(provider: readonly ReconLine[], recorded: readonly ReconLine[]): ReconDiff[] {
  const key = (l: ReconLine) => `${l.kind}:${l.paymentId}`;
  const sum = (ls: readonly ReconLine[]) => {
    const m = new Map<string, ReconLine>();
    for (const l of ls) {
      const k = key(l);
      const prev = m.get(k);
      m.set(k, { ...l, amountKurus: (prev?.amountKurus ?? 0) + Math.abs(l.amountKurus) });
    }
    return m;
  };
  const p = sum(provider);
  const r = sum(recorded);
  const out: ReconDiff[] = [];
  for (const [k, l] of p) {
    const rec = r.get(k);
    if (!rec)
      out.push({
        paymentId: l.paymentId,
        kind: l.kind,
        problem: 'kayitta_yok',
        providerKurus: l.amountKurus,
        recordedKurus: null,
      });
    else if (rec.amountKurus !== l.amountKurus)
      out.push({
        paymentId: l.paymentId,
        kind: l.kind,
        problem: 'tutar_farki',
        providerKurus: l.amountKurus,
        recordedKurus: rec.amountKurus,
      });
  }
  for (const [k, l] of r)
    if (!p.has(k))
      out.push({
        paymentId: l.paymentId,
        kind: l.kind,
        problem: 'saglayicida_yok',
        providerKurus: null,
        recordedKurus: l.amountKurus,
      });
  return out.sort((a, b) => (a.paymentId < b.paymentId ? -1 : a.paymentId > b.paymentId ? 1 : 0));
}
