import { ortak } from '@kazuist/i18n';
import { BosDurum, Dugme } from '@kazuist/ui';
import { modulAcik } from './rotalar.ts';

/** 404 body, rendered by app/not-found.tsx inside the shell. */
export function Bulunamadi() {
  const t = ortak();
  return (
    <div className="sayfa">
      <p className="ust-etiket kz-mono">404</p>
      <h1 className="kz-gorunmez">{t.durum.bulunamadiBaslik}</h1>
      <BosDurum
        baslik={t.durum.bulunamadiBaslik}
        aciklama={<p>{t.durum.bulunamadiAciklama}</p>}
        eylem={
          <>
            <Dugme href="/">{t.durum.anaSayfaya}</Dugme>
            {modulAcik('/ara') ? (
              <Dugme href="/ara" tur="ikincil">
                {t.durum.aramaya}
              </Dugme>
            ) : null}
          </>
        }
      />
    </div>
  );
}
