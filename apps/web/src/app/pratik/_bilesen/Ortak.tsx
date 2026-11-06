import { ortak } from '@kazuist/i18n';
import { tr } from './metin.ts';
import styles from '../pratik.module.css';

/** Shown on every page where unapproved cards are visible (staging only). */
export function OnizlemeBandi() {
  return (
    <aside className={styles.not} aria-labelledby="onizleme-baslik">
      <h2 id="onizleme-baslik">{tr.onizleme.baslik}</h2>
      <p>{tr.onizleme.metin}</p>
    </aside>
  );
}

/** Fixed notes of the module: sourcing, device storage, and the product-wide advice notice (plan 7.5). */
export function SabitNotlar() {
  return (
    <footer className={styles.sabitNotlar}>
      <p>{tr.kaynakNotu}</p>
      <p>{tr.cihazNotu}</p>
      <p>{ortak('tr').uyari.danismanlik}</p>
    </footer>
  );
}
