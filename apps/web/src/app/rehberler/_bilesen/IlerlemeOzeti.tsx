'use client';

import { yuzde } from '../_alan/ilerleme.ts';
import styles from '../rehberler.module.css';
import { doldur, tr } from './metin.ts';
import { useIlerleme } from './useIlerleme.ts';

/** One line of progress for a list on the index page, read from this browser. */
export function IlerlemeOzeti({
  liste,
  idler,
  durumSablonu,
}: {
  liste: 'makale' | 'tez' | 'kontrol';
  idler: string[];
  durumSablonu: 'adim' | 'madde';
}) {
  const { depo } = useIlerleme({ [liste]: idler });
  const yapilan = depo?.[liste].length ?? 0;
  const toplam = idler.length;
  return (
    <span className={styles.ipucu} aria-live="polite">
      {yapilan === 0
        ? tr.ilerleme.ozetYok
        : `${doldur(durumSablonu === 'adim' ? tr.ilerleme.durumAdim : tr.ilerleme.durumMadde, { yapilan, toplam })}, ${yuzde(yapilan, toplam)}%`}
    </span>
  );
}
