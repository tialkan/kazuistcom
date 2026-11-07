'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bosDepo,
  depoAnahtari,
  depoyuOku,
  isaretle as isaretleDepo,
  type Depo,
  type Liste,
} from '../_alan/ilerleme.ts';

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
 * Guide progress kept in this browser (localStorage). `depo` is null until the first client render has read it, so
 * server and client markup agree. `gecerli` names the ids of the lists the page knows; other lists are kept as
 * stored. The ids array of a page is static content, so it is read once.
 */
export function useIlerleme(gecerli: Partial<Record<Liste, readonly string[]>>) {
  const [depo, setDepo] = useState<Depo | null>(null);
  const [kaydedilemedi, setKaydedilemedi] = useState(false);
  const guncel = useRef<Depo | null>(null);
  const idler = useRef(gecerli);

  useEffect(() => {
    const d = depoyuOku(oku(), idler.current);
    guncel.current = d;
    setDepo(d);
  }, []);

  const uygula = useCallback((fn: (d: Depo) => Depo) => {
    const sonraki = fn(guncel.current ?? depoyuOku(oku(), idler.current));
    guncel.current = sonraki;
    setDepo(sonraki);
    setKaydedilemedi(!yaz(sonraki));
  }, []);

  const isaretle = useCallback(
    (liste: Liste, id: string, tamam: boolean) => {
      const izinli = idler.current[liste] ?? [];
      uygula((d) => isaretleDepo(d, liste, id, tamam, izinli));
    },
    [uygula],
  );

  const temizle = useCallback(
    (liste: Liste) => uygula((d) => ({ ...(d ?? bosDepo()), [liste]: [] })),
    [uygula],
  );

  return { depo, isaretle, temizle, kaydedilemedi };
}
