'use client';

import { useEffect, useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

import styles from './verilerim.module.css';

const s = tr.sayfa.silme;
interface Wallet {
  balance: number;
  lots: { source: string; remaining: number }[];
}

export function AccountDeletion() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [requestRefund, setRequestRefund] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const load = async () => {
    setWallet(null);
    setLoadError(false);
    try {
      const response = await fetch('/api/v1/wallet', { cache: 'no-store' });
      if (!response.ok) throw new Error('Wallet unavailable');
      const data: unknown = await response.json();
      const w = data as Partial<Wallet> | null;
      if (
        !w ||
        !Number.isFinite(w.balance) ||
        !Array.isArray(w.lots) ||
        w.lots.some((lot) => typeof lot.source !== 'string' || !Number.isFinite(lot.remaining))
      )
        throw new Error('Invalid wallet');
      setWallet(w as Wallet);
    } catch {
      setLoadError(true);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!wallet || !confirmed || state === 'pending') return;
    setState('pending');
    try {
      const response = await fetch('/api/v1/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestRefund }),
      });
      if (response.status !== 202) throw new Error('Account deletion failed');
      setState('done');
    } catch {
      setState('error');
    }
  };
  const unused =
    wallet?.lots.filter((lot) => lot.source === 'paket').reduce((sum, lot) => sum + lot.remaining, 0) ?? 0;
  if (state === 'done') return <p role="status">{s.silindi}</p>;
  return (
    <section className={styles.deletion} aria-labelledby="account-delete-heading">
      <h2 id="account-delete-heading">{s.baslik}</h2>
      {!wallet && !loadError && <p role="status">{s.yukleniyor}</p>}
      {loadError && (
        <>
          <p role="alert">{s.hata}</p>
          <button type="button" onClick={() => void load()}>
            {s.yeniden}
          </button>
        </>
      )}
      {wallet && (
        <form onSubmit={(event) => void submit(event)}>
          <p>{s.bakiye.replace('{kredi}', wallet.balance.toLocaleString('tr-TR'))}</p>
          {unused > 0 && (
            <>
              <p>{s.uyari.replace('{kredi}', unused.toLocaleString('tr-TR'))}</p>
              <label>
                <input
                  type="checkbox"
                  checked={requestRefund}
                  disabled={state === 'pending'}
                  onChange={(event) => setRequestRefund(event.target.checked)}
                />
                {s.iade}
              </label>
            </>
          )}
          <p>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={state === 'pending'}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {s.onay}
            </label>
          </p>
          <button type="submit" disabled={!confirmed || state === 'pending'}>
            {state === 'pending' ? s.siliniyor : s.sil}
          </button>
          {state === 'error' && <p role="alert">{s.islemHata}</p>}
        </form>
      )}
    </section>
  );
}
