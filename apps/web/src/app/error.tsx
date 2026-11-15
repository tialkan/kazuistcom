'use client';
import { HataGovdesi } from './(kabuk)/_kabuk/HataGovdesi.tsx';

/** Error boundary of every page below the root layout; the shell (menu and footer) stays in place. */
export default function Hata({ error, retry }: { error: unknown; retry: () => void }) {
  return <HataGovdesi error={error} retry={retry} />;
}
