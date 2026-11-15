import { ortak } from '@kazuist/i18n';
import { Yukleniyor } from '@kazuist/ui';

/**
 * Shared loading.tsx body for routes that wait on the database (Kaydettiklerim, Atıf ağı). Only routes whose
 * pages never call notFound() or redirect() use it: inside a loading boundary those would stream with status 200.
 */
export function SayfaYukleniyor() {
  const t = ortak();
  return (
    <div className="sayfa">
      <Yukleniyor metin={t.durum.yukleniyorMetin} satir={4} />
    </div>
  );
}
