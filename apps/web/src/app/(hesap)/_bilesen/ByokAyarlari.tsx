'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  browserStorages,
  checkOpenRouterKey,
  clearByokSettings,
  DEFAULT_BYOK_MODEL,
  isFreeModel,
  isValidModelId,
  keyProblem,
  maskKey,
  OPENROUTER_BYOK_MODELS,
  readByokSettings,
  saveByokSettings,
  type ByokPersistence,
  type ByokSettings,
  type KeyCheck,
} from '@kazuist/ai-gateway/browser';
import b from '@kazuist/i18n/tr/byok.json' with { type: 'json' };
import { Dugme, FormAlani } from '@kazuist/ui';
import styles from './hesap.module.css';

const DIGER = 'diger';

const doldur = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

const modelAdi = (id: string) => OPENROUTER_BYOK_MODELS.find((m) => m.id === id)?.name ?? id;

type Bildirim = { tur: 'durum' | 'hata'; metin: string[] } | null;

function kontrolMetni(r: KeyCheck): Bildirim {
  if (!r.ok) return { tur: 'hata', metin: [b.hata[r.kind]] };
  const metin = [b.durum.gecerli];
  if (r.freeTier) metin.push(b.durum.ucretsizKatman);
  if (!r.limited) metin.push(b.durum.sinirsiz);
  return { tur: 'durum', metin };
}

/**
 * BYOK settings (FR-84, plan 8.3, K-08). The key is read from and written to this browser's Web Storage only;
 * nothing here sends it to Kazuist. The stored key is never put back into the input, only its masked form is
 * shown. "Anahtarı dene" asks OpenRouter directly, which also tells whether the key is on the free tier.
 */
export function ByokAyarlari() {
  const [yuklendi, setYuklendi] = useState(false);
  const [kayitli, setKayitli] = useState<ByokSettings | null>(null);
  const [secim, setSecim] = useState<string>(DEFAULT_BYOK_MODEL);
  const [ozelModel, setOzelModel] = useState('');
  const [anahtar, setAnahtar] = useState('');
  const [saklama, setSaklama] = useState<ByokPersistence>('oturum');
  const [zdr, setZdr] = useState(false);
  const [anahtarHata, setAnahtarHata] = useState('');
  const [modelHata, setModelHata] = useState('');
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [deneniyor, setDeneniyor] = useState(false);

  useEffect(() => {
    const s = readByokSettings(browserStorages());
    // Web Storage exists only in the browser, so the saved state is read after hydration.
    setKayitli(s);
    if (s) {
      const bilinen = OPENROUTER_BYOK_MODELS.some((m) => m.id === s.model);
      setSecim(bilinen ? s.model : DIGER);
      if (!bilinen) setOzelModel(s.model);
      setSaklama(s.persistence);
      setZdr(s.zdr);
    }
    setYuklendi(true);
  }, []);

  const model = secim === DIGER ? ozelModel.trim() : secim;

  function kaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBildirim(null);
    const yeniAnahtar = anahtar.trim() || kayitli?.apiKey || '';
    const kp = keyProblem(yeniAnahtar);
    const mHata = isValidModelId(model) ? '' : b.hata.modelBicim;
    setAnahtarHata(kp === 'bos' ? b.hata.anahtarBos : kp === 'bicim' ? b.hata.anahtarBicim : '');
    setModelHata(mHata);
    if (kp || mHata) return;
    const s: ByokSettings = { provider: 'openrouter', model, apiKey: yeniAnahtar, zdr, persistence: saklama };
    if (!saveByokSettings(browserStorages(), s)) {
      setBildirim({ tur: 'hata', metin: [b.durum.kaydedilemedi] });
      return;
    }
    setKayitli(s);
    setAnahtar('');
    setBildirim({ tur: 'durum', metin: [b.durum.kaydedildi] });
  }

  function sil() {
    clearByokSettings(browserStorages());
    setKayitli(null);
    setAnahtar('');
    setAnahtarHata('');
    setBildirim({ tur: 'durum', metin: [b.durum.silindi] });
  }

  async function dene() {
    const k = anahtar.trim() || kayitli?.apiKey || '';
    const kp = keyProblem(k);
    if (kp) {
      setAnahtarHata(kp === 'bos' ? b.hata.anahtarBos : b.hata.anahtarBicim);
      return;
    }
    setAnahtarHata('');
    setDeneniyor(true);
    setBildirim({ tur: 'durum', metin: [b.durum.deneniyor] });
    const r = await checkOpenRouterKey(k);
    setDeneniyor(false);
    setBildirim(kontrolMetni(r));
  }

  return (
    <>
      <section aria-labelledby="byok-durum" className={styles.kutu}>
        <h2 id="byok-durum">{b.durum.baslik}</h2>
        <p data-testid="byok-durum">
          {!yuklendi
            ? b.durum.yukleniyor
            : kayitli
              ? `${doldur(b.durum.kayitli, { anahtar: maskKey(kayitli.apiKey), model: modelAdi(kayitli.model) })} ${
                  kayitli.persistence === 'cihaz' ? b.durum.cihazda : b.durum.oturumda
                }`
              : b.durum.yok}
        </p>
        {kayitli ? (
          <Dugme tur="ikincil" onClick={sil}>
            {b.form.sil}
          </Dugme>
        ) : null}
      </section>

      <form
        className={`${styles.form} ${styles.dar}`}
        onSubmit={kaydet}
        noValidate
        aria-labelledby="byok-form"
      >
        <h2 id="byok-form">{b.form.baslik}</h2>
        <p>
          <span className={styles.etiket}>{b.form.saglayici}</span>
          {b.form.saglayiciAdi}
        </p>
        <p className={styles.soluk}>{b.form.saglayiciNot}</p>

        <fieldset className={styles.grup}>
          <legend>{b.form.model}</legend>
          <div className={styles.secenekler}>
            {OPENROUTER_BYOK_MODELS.map((m) => (
              <label key={m.id} className={styles.secim}>
                <input
                  type="radio"
                  name="model"
                  value={m.id}
                  checked={secim === m.id}
                  onChange={() => setSecim(m.id)}
                />
                <span>
                  {m.name}
                  {m.id === DEFAULT_BYOK_MODEL ? ` (${b.form.onerilen})` : ''}{' '}
                  <code className={styles.soluk}>{m.id}</code>
                </span>
              </label>
            ))}
            <label className={styles.secim}>
              <input
                type="radio"
                name="model"
                value={DIGER}
                checked={secim === DIGER}
                onChange={() => setSecim(DIGER)}
              />
              <span>{b.form.modelDiger}</span>
            </label>
          </div>
        </fieldset>
        {secim === DIGER ? (
          <FormAlani
            id="byok-model"
            etiket={b.form.modelKimligi}
            ipucu={b.form.modelKimligiIpucu}
            value={ozelModel}
            onChange={(e) => setOzelModel(e.target.value)}
            maxLength={120}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            {...(modelHata ? { hata: modelHata } : {})}
          />
        ) : null}
        {isFreeModel(model) ? (
          <div className={`${styles.kutu} ${styles['kutu--uyari']}`} role="note">
            <h3>{b.ucretsiz.baslik}</h3>
            <p>{b.ucretsiz.metin}</p>
          </div>
        ) : null}

        <FormAlani
          id="byok-anahtar"
          etiket={b.form.anahtar}
          ipucu={kayitli ? b.form.anahtarKayitliIpucu : b.form.anahtarIpucu}
          type="password"
          value={anahtar}
          onChange={(e) => setAnahtar(e.target.value)}
          maxLength={400}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          {...(anahtarHata ? { hata: anahtarHata } : {})}
        />

        <fieldset className={styles.grup}>
          <legend>{b.form.saklama}</legend>
          <div className={styles.secenekler}>
            <label className={styles.secim}>
              <input
                type="radio"
                name="saklama"
                value="oturum"
                checked={saklama === 'oturum'}
                onChange={() => setSaklama('oturum')}
              />
              <span>{b.form.oturum}</span>
            </label>
            <label className={styles.secim}>
              <input
                type="radio"
                name="saklama"
                value="cihaz"
                checked={saklama === 'cihaz'}
                onChange={() => setSaklama('cihaz')}
              />
              <span>{b.form.cihaz}</span>
            </label>
          </div>
        </fieldset>
        {saklama === 'cihaz' ? (
          <p className={`${styles.kutu} ${styles['kutu--uyari']}`} role="note">
            {b.form.cihazUyari}
          </p>
        ) : null}

        <label className={styles.secim}>
          <input type="checkbox" checked={zdr} onChange={(e) => setZdr(e.target.checked)} />
          <span>{b.form.gizlilik}</span>
        </label>
        <p className={styles.soluk}>{b.form.gizlilikNot}</p>

        <div className={styles.eylemler}>
          <Dugme type="submit">{b.form.kaydet}</Dugme>
          <Dugme tur="ikincil" onClick={dene} disabled={deneniyor}>
            {b.form.dene}
          </Dugme>
        </div>
        <div role="status" aria-live="polite">
          {bildirim
            ? bildirim.metin.map((m) => (
                <p key={m} className={bildirim.tur === 'hata' ? styles.hata : styles.durum}>
                  {m}
                </p>
              ))
            : null}
        </div>
      </form>
    </>
  );
}
