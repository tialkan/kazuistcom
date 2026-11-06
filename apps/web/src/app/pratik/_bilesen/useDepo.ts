'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { depoAnahtari, depoyuOku, type Depo } from '../_alan/depo.ts';

function oku(): string | null {
  try {
    return window.localStorage.getItem(depoAnahtari);
  } catch {
    return null;
  }
}

function yaz(d: Depo): boolean {
  try {
    window.localStorage.setItem(depoAnahtari, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/**
 * Study progress kept in this browser (localStorage). `depo` is null until the first client render has read it,
 * so server and client markup agree. `guncelle` applies a pure function from depo.ts and saves the result.
 */
export function useDepo() {
  const [depo, setDepo] = useState<Depo | null>(null);
  const [kaydedilemedi, setKaydedilemedi] = useState(false);
  const guncel = useRef<Depo | null>(null);

  useEffect(() => {
    const d = depoyuOku(oku(), new Date());
    guncel.current = d;
    setDepo(d);
  }, []);

  /** Applies `fn` to the current value, saves the result and returns it. */
  const guncelle = useCallback((fn: (d: Depo) => Depo): Depo => {
    const sonraki = fn(guncel.current ?? depoyuOku(oku(), new Date()));
    guncel.current = sonraki;
    setDepo(sonraki);
    setKaydedilemedi(!yaz(sonraki));
    return sonraki;
  }, []);

  return { depo, guncelle, kaydedilemedi };
}
