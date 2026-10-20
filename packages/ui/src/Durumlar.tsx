import type { ReactNode } from 'react';

type DurumProps = { baslik: string; aciklama?: ReactNode; eylem?: ReactNode };

/** Empty state: says what is missing and what the user can do next. */
export function BosDurum({ baslik, aciklama, eylem }: DurumProps) {
  return (
    <section className="kz-durum kz-durum--bos">
      <h2 className="kz-durum__baslik">{baslik}</h2>
      {aciklama ? <div className="kz-durum__aciklama">{aciklama}</div> : null}
      {eylem ? <div className="kz-durum__eylem">{eylem}</div> : null}
    </section>
  );
}

/** Error state, announced as an alert. Never shows stack traces or internal names (wt.65). */
export function HataDurumu({ baslik, aciklama, eylem }: DurumProps) {
  return (
    <section className="kz-durum kz-durum--hata" role="alert">
      <h2 className="kz-durum__baslik">
        <span className="kz-durum__isaret" aria-hidden="true">
          !
        </span>
        {baslik}
      </h2>
      {aciklama ? <div className="kz-durum__aciklama">{aciklama}</div> : null}
      {eylem ? <div className="kz-durum__eylem">{eylem}</div> : null}
    </section>
  );
}

/** Loading state: polite status text plus ruled placeholder lines that stop moving under reduced motion. */
export function Yukleniyor({ metin, satir = 3 }: { metin: string; satir?: number }) {
  return (
    <div className="kz-durum kz-durum--yukleniyor" role="status" aria-live="polite">
      <span className="kz-durum__metin">{metin}</span>
      <div className="kz-durum__cizgiler" aria-hidden="true">
        {Array.from({ length: satir }, (_, i) => (
          <span key={i} className="kz-durum__cizgi" />
        ))}
      </div>
    </div>
  );
}
