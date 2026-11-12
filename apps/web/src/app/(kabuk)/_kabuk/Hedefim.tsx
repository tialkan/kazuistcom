import { HedefimBagi } from './HedefimBagi.tsx';
import type { KabukOturumu } from './oturum.ts';
import { kabukOturumu } from './oturumYukle.ts';

/**
 * Server side Hedefim slot. The root layout may pass the session it already has; otherwise the slot reads
 * it from the request (the layout renders per request, see `connection()` there).
 */
export async function Hedefim({ oturum }: { oturum?: KabukOturumu | null }) {
  return <HedefimBagi oturum={oturum === undefined ? await kabukOturumu() : oturum} />;
}
