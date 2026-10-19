/** Credit ledger (plan 9.1), pure TypeScript. Owner: odeme agent. */
export type EntrySide = 'borc' | 'alacak';

export interface Entry {
  accountId: string;
  side: EntrySide;
  credits: number;
}

/** A transaction is valid when all amounts are positive integers and debits equal credits. */
export function isBalanced(entries: readonly Entry[]): boolean {
  if (entries.length < 2) return false;
  let sum = 0;
  for (const e of entries) {
    if (!Number.isInteger(e.credits) || e.credits <= 0) return false;
    sum += e.side === 'borc' ? e.credits : -e.credits;
  }
  return sum === 0;
}
