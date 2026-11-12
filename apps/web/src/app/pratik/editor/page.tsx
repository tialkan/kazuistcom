import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { gecerliOnaylar } from '../_alan/kart.ts';
import { onayKuyrugu } from '../_alan/onay.ts';
import { tumDesteler } from '../_veri/desteler.ts';
import { doldur, oyunMetni, tarihTr, tr } from '../_bilesen/metin.ts';
import styles from '../pratik.module.css';

export const metadata: Metadata = {
  title: tr.meta.editorBaslik,
  robots: { index: false, follow: false },
};

/** Editors and administrators only. A missing session, a missing role or any failure reads as "no access". */
async function editorMu(): Promise<boolean> {
  try {
    const { getAuthContext } = await import('@/server/auth/context.ts');
    const { resolvePrincipal } = await import('@/server/auth/guard.ts');
    const ctx = await getAuthContext();
    const istek = new Request('http://localhost/pratik/editor', { headers: await headers() });
    const p = await resolvePrincipal(istek, ctx);
    return p !== null && (p.roles.includes('editor') || p.roles.includes('yonetici'));
  } catch {
    return false;
  }
}

export default async function EditorSayfasi() {
  const yetkili = await editorMu();
  if (!yetkili) {
    return (
      <div className="sayfa">
        <header className="sayfa-ust">
          <h1>{tr.editor.baslik}</h1>
        </header>
        <p role="alert">{tr.editor.yetkiYok}</p>
      </div>
    );
  }
  const kuyruk = onayKuyrugu(tumDesteler);
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <p>
          <a href="/pratik">{tr.deste.geri}</a>
        </p>
        <h1>{tr.editor.baslik}</h1>
        <p className="sayfa-ust__giris">{tr.editor.giris}</p>
      </header>

      <section className={styles.bolum} aria-labelledby="nasil-baslik">
        <h2 id="nasil-baslik">{tr.editor.nasil}</h2>
        <p>{tr.editor.nasilMetin}</p>
      </section>

      <section className={styles.bolum} aria-labelledby="kuyruk-baslik">
        <h2 id="kuyruk-baslik">{tr.editor.tabloBaslik}</h2>
        {kuyruk.length === 0 ? (
          <p>{tr.editor.bosKuyruk}</p>
        ) : (
          <ul className={styles.kuyruk}>
            {kuyruk.map((s) => {
              const k = s.kart;
              const onaylar = gecerliOnaylar(k);
              const dogrulama = k.kaynaklar
                .map((x) => x.dogrulamaTarihi)
                .filter((t): t is string => t !== null);
              return (
                <li key={k.id}>
                  <details>
                    <summary>
                      <strong className="kz-mono">{k.id}</strong>
                      {': '}
                      {s.durum === 'onay_bekliyor' ? tr.editor.durumOnayBekliyor : tr.editor.durumTaslak}
                      {' / '}
                      {tr.editor.eksik}: {s.eksikOnay}
                    </summary>
                    <p>
                      {tr.editor.deste}: {s.desteBasligi}. {tr.editor.oyun}: {oyunMetni(k.oyun).ad}.
                    </p>
                    <p>{k.soru}</p>
                    <ol className={styles.editorSecenekler}>
                      {k.secenekler.map((o, i) => (
                        <li key={i}>
                          {o}
                          {i === k.dogruIndex ? ` (${tr.geri.dogruSecenek})` : ''}
                        </li>
                      ))}
                    </ol>
                    <p>{k.aciklama}</p>
                    {k.kaynaklar.map((x, i) => (
                      <div key={i}>
                        <p className={styles.kanunKunye}>
                          {x.bolum === 'madde'
                            ? doldur(tr.geri.kunye, { kanun: x.kanunAdi, madde: x.madde ?? '' })
                            : doldur(tr.geri.kunyeBaslik, { kanun: x.kanunAdi })}
                        </p>
                        {x.alintilar.map((a, j) => (
                          <blockquote key={j} className={styles.alinti}>
                            <p>{a}</p>
                          </blockquote>
                        ))}
                        <p>
                          <a href={x.url} target="_blank" rel="noopener noreferrer">
                            {tr.geri.ac}
                            <span className="kz-gorunmez"> ({tr.geri.yeniSekme})</span>
                          </a>
                        </p>
                      </div>
                    ))}
                    <p>
                      {tr.editor.kaynakDogrulama.replace(
                        '{tarih}',
                        dogrulama.length === k.kaynaklar.length
                          ? tarihTr(dogrulama.sort()[0] as string)
                          : tr.editor.dogrulanmadi,
                      )}
                    </p>
                    <p>
                      {onaylar.length
                        ? doldur(tr.editor.onaylayanlar, { liste: onaylar.map((o) => o.ad).join(', ') })
                        : tr.editor.onaysiz}
                    </p>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
