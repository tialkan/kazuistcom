'use client';

import { useEffect, useState } from 'react';

/** Launch moment: 12 December 2026, 00:00 Istanbul time (UTC+3). */
export const LANSMAN = Date.parse('2026-12-12T00:00:00+03:00');

type Birimler = { gun: string; saat: string; dakika: string; saniye: string };

function kalan(simdi: number) {
  const ms = Math.max(0, LANSMAN - simdi);
  const s = Math.floor(ms / 1000);
  return {
    gun: Math.floor(s / 86400),
    saat: Math.floor(s / 3600) % 24,
    dakika: Math.floor(s / 60) % 60,
    saniye: s % 60,
    bitti: ms === 0,
  };
}

const iki = (n: number) => String(n).padStart(2, '0');

/** Each digit re-mounts when it changes, so it drops in with the CSS animation. */
function Hane({ deger }: { deger: string }) {
  return (
    <span className="kzw-hane" aria-hidden="true">
      <span key={deger}>{deger}</span>
    </span>
  );
}

export function GeriSayim({ birim, bitti }: { birim: Birimler; bitti: string }) {
  const [an, setAn] = useState<number | null>(null);
  useEffect(() => {
    setAn(Date.now());
    const id = window.setInterval(() => setAn(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (an == null) return <ul className="kzw-sayac" aria-hidden="true" />;
  const k = kalan(an);
  if (k.bitti) return <p className="kzw-lansman-ust">{bitti}</p>;
  const satir: Array<[string, string]> = [
    [String(k.gun), birim.gun],
    [iki(k.saat), birim.saat],
    [iki(k.dakika), birim.dakika],
    [iki(k.saniye), birim.saniye],
  ];
  return (
    <>
      <p className="kzw-gizli" role="timer" aria-live="off">
        {satir.map(([d, b]) => `${d} ${b}`).join(', ')}
      </p>
      <ul className="kzw-sayac">
        {satir.map(([d, b]) => (
          <li key={b}>
            <Hane deger={d} />
            <span className="kzw-birim">{b}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
