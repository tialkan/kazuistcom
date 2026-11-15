/**
 * Payments-off launch mode. Kazuist opens before credit sales do: free daily allowance and BYOK carry the AI
 * features (plan 4.1/2, K-09). Without the iyzico credentials the credit purchase entry points must not offer a
 * buy flow that can only end in 503; they show the free and BYOK options instead. Same "empty counts as
 * missing" rule as getBillingService (context.ts). Pure, so pages can import it without the billing stack.
 */
export function odemeAcik(env: Record<string, string | undefined> = process.env): boolean {
  return ['IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_MERCHANT_ID'].every((k) => Boolean(env[k]?.trim()));
}
