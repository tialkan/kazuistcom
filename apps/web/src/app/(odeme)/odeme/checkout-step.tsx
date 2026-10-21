'use client';

import odeme from '@kazuist/i18n/tr/odeme.json';
import { useId, useState } from 'react';
import { canPay, type CheckoutKind } from './gate.ts';

/**
 * Payment step skeleton: pre-contract information shown right before the payment obligation, the
 * confirmation box and the separate withdrawal exception box. Legal texts come from hukuk-uyum; the
 * keys here are placeholders. Accepted versions are posted with the checkout request and stored in consents.
 */
export function CheckoutStep(props: { kind: CheckoutKind; productLabel: string; priceLabel: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const hintId = useId();
  const open = canPay({ kind: props.kind, confirmed, withdrawalWaiver: waiver });
  return (
    <form method="post" action="/odeme" aria-describedby={hintId}>
      <p>
        {odeme.urun}: {props.productLabel}. {odeme.fiyatKdvDahil}: {props.priceLabel}
      </p>
      <section aria-labelledby="onb">
        <h2 id="onb">{odeme.onBilgilendirme.baslik}</h2>
        <div style={{ fontSize: '1rem', maxHeight: '16rem', overflow: 'auto' }} tabIndex={0}>
          {odeme.onBilgilendirme.metin}
        </div>
      </section>
      <section aria-labelledby="mss">
        <h2 id="mss">{odeme.mesafeliSozlesme.baslik}</h2>
        <div style={{ fontSize: '1rem', maxHeight: '16rem', overflow: 'auto' }} tabIndex={0}>
          {odeme.mesafeliSozlesme.metin}
        </div>
      </section>
      <label style={{ display: 'flex', gap: '0.5rem', minHeight: 44, alignItems: 'center' }}>
        <input
          type="checkbox"
          name="teyit"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {odeme.teyitKutusu}
      </label>
      <label style={{ display: 'flex', gap: '0.5rem', minHeight: 44, alignItems: 'center' }}>
        <input
          type="checkbox"
          name="caymaIstisnasi"
          checked={waiver}
          onChange={(e) => setWaiver(e.target.checked)}
        />
        {odeme.caymaIstisnasiKutusu}
      </label>
      <p id={hintId} aria-live="polite">
        {open ? null : odeme.odemeKapali}
      </p>
      <button type="submit" disabled={!open} style={{ minHeight: 44 }}>
        {odeme.odemeyeGec}
      </button>
    </form>
  );
}
