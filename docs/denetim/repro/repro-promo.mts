const L = '/Users/baris/Documents/GitHub/Kazuist/packages/ledger/src';
const { Ledger, LedgerError } = await import(`${L}/index.ts`);
const l = new Ledger();
const W = 'w';
const t0 = new Date('2026-10-20T09:00:00Z');
l.grant({ key: 'promo', walletId: W, source: 'promosyon', credits: 50, originRef: 'kupon:X', now: t0 });
const exp = new Date(t0.getTime() + 90 * 86_400_000);
const justBefore = new Date(exp.getTime() - 60_000);
l.reserve({ operationId: 'op', walletId: W, estimatedCredits: 10, now: justBefore });
const after = new Date(exp.getTime() + 60_000);
l.expirePromos(W, after);           // expires the 40 unreserved credits, key son_kullanma:<lot> used
l.sweepExpired(W, new Date(after.getTime() + 5 * 60_000)); // reservation released, 10 credits go back to the expired lot
l.expirePromos(W, new Date(after.getTime() + 10 * 60_000));
const lot = l.wallet(W).lots[0];
let err = null; try { l.reserve({ operationId: 'op2', walletId: W, estimatedCredits: 1, now: new Date(after.getTime() + 11 * 60_000) }); } catch (e) { err = e.code; }
console.log('expired promo lot remaining:', lot.remainingCredits, '| balance() shown by GET /v1/wallet:', l.balance(W), '| spendable balance(now):', l.balance(W, new Date(after.getTime() + 11 * 60_000)), '| reserve 1:', err);
