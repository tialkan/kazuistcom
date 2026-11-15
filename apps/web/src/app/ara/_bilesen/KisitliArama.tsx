import ara from '@kazuist/i18n/tr/ara.json';
import styles from '../ara.module.css';

/**
 * Tells the visitor that a retrieval leg could not run (SearchResult.degraded): without the embedding service the
 * results come from keyword and reference matching only, so sources worded differently may be missing.
 */
export function KisitliArama({ degraded }: { degraded: readonly string[] }) {
  if (!degraded.includes('vektor')) return null;
  return (
    <p className={styles.fikstur} data-testid="arama-kisitli">
      <strong>{ara.kisitli.baslik}: </strong>
      {ara.kisitli.vektor}
    </p>
  );
}
