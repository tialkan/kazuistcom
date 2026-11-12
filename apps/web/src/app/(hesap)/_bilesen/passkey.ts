import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';

/**
 * Better Auth browser client, used only for the WebAuthn ceremonies (navigator.credentials). Every other
 * account call is a plain same origin fetch (istek.ts). Created lazily in the browser so server rendering
 * never builds it.
 */
function yeniIstemci() {
  return createAuthClient({
    baseURL: window.location.origin,
    basePath: '/api/auth',
    plugins: [passkeyClient()],
  });
}

let istemci: ReturnType<typeof yeniIstemci> | undefined;
const al = () => (istemci ??= yeniIstemci());

export const passkeyDestekleniyor = () =>
  typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';

/** Sign in with a passkey; true when a session was opened. */
export async function passkeyIleGiris(): Promise<boolean> {
  const r = await al().signIn.passkey();
  return !r?.error;
}

/** Register a passkey for the signed in user; true on success. */
export async function passkeyEkle(ad?: string): Promise<boolean> {
  const r = await al().passkey.addPasskey(ad ? { name: ad } : undefined);
  return !r?.error;
}
