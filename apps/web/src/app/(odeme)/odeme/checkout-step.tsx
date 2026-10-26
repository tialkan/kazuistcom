'use client';

import styles from './checkout-step.module.css';
import odeme from '@kazuist/i18n/tr/odeme.json';
import { useId, useState, type FormEvent } from 'react';
import { canPay, type CheckoutKind } from './gate.ts';
import { checkoutRequest, nextStep } from './submit.ts';
import type { CheckoutLegalPresentation } from './legal-presentation.ts';
import { BlokGoster } from '../../(kabuk)/_hukuki/HukukiGovde.tsx';

/**
 * Payment step: pre-contract information shown right before the payment obligation, the confirmation box
 * and the separate withdrawal exception box. Submitting posts the accepted versions to the checkout API
 * (consents are written server side) and continues to iyzico. Legal bodies and accepted versions come from the same publication-gated source.
 */
export function CheckoutStep(props: {
  kind: CheckoutKind;
  code: string;
  productLabel: string;
  priceLabel: string;
  legal: CheckoutLegalPresentation | null;
  blockedMessage?: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const hintId = useId();
  const open = canPay({ kind: props.kind, confirmed, withdrawalWaiver: waiver }) && !!props.legal && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!open || !props.legal) return;
    setBusy(true);
    setError(null);
    try {
      const { url, init } = checkoutRequest({
        kind: props.kind,
        code: props.code,
        versions: props.legal.versions,
        withdrawalWaiver: waiver,
        idempotencyKey: key,
      });
      const res = await fetch(url, init);
      if (res.status === 401) throw new Error(odeme.hata.girisGerekli);
      if (!res.ok) throw new Error(odeme.hata.genel);
      const step = nextStep(
        (await res.json()) as { paymentPageUrl?: string | null; checkoutFormContent?: string },
      );
      if (step.kind === 'redirect') window.location.assign(step.url);
      else if (step.kind === 'frame') setFrame(step.html);
      else throw new Error(odeme.hata.genel);
    } catch (err) {
      setError(err instanceof Error ? err.message : odeme.hata.genel);
      setBusy(false);
    }
  }

  if (frame)
    return (
      <iframe
        title={odeme.iyzicoFormu}
        srcDoc={frame}
        sandbox="allow-scripts allow-forms allow-top-navigation allow-popups"
        style={{ width: '100%', minHeight: '40rem', border: 0 }}
      />
    );

  return (
    <form onSubmit={submit} aria-describedby={hintId}>
      <p>
        {odeme.urun}: {props.productLabel}. {odeme.fiyatKdvDahil}: {props.priceLabel}
      </p>
      {props.legal?.documents.map((document) => {
        const titleId = `${hintId}-${document.slug}`;
        return (
          <section key={document.slug} aria-labelledby={titleId}>
            <h2 id={titleId}>{document.title}</h2>
            <p>
              {odeme.metinSurumu}: {document.version}
            </p>
            <div role="region" aria-labelledby={titleId} tabIndex={0} className={styles.body}>
              <BlokGoster bloklar={document.blocks} tablo={odeme.hukukiTablo} />
            </div>
          </section>
        );
      })}
      <label style={{ display: 'flex', gap: '0.5rem', minHeight: 44, alignItems: 'center' }}>
        <input
          type="checkbox"
          name="teyit"
          disabled={!props.legal || busy}
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {props.kind === 'abonelik' ? odeme.teyitAbonelikKutusu : odeme.teyitKutusu}
      </label>
      <label style={{ display: 'flex', gap: '0.5rem', minHeight: 44, alignItems: 'center' }}>
        <input
          type="checkbox"
          name="caymaIstisnasi"
          disabled={!props.legal || busy}
          checked={waiver}
          onChange={(e) => setWaiver(e.target.checked)}
        />
        {odeme.caymaIstisnasiKutusu}
      </label>
      <p id={hintId} aria-live="polite">
        {error ??
          (!props.legal
            ? (props.blockedMessage ?? odeme.hukukiMetinKapali)
            : open || busy
              ? null
              : odeme.odemeKapali)}
      </p>
      <button type="submit" disabled={!open} style={{ minHeight: 44 }}>
        {busy ? odeme.yonlendiriliyor : odeme.odemeyeGec}
      </button>
    </form>
  );
}
