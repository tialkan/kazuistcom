import type { ReactNode } from 'react';

/**
 * Kenar serhi, the signature element (plan 12.3). Each sentence sits in the reading column and
 * its sources sit in the right margin at the same height, like a classical commentary.
 * Below the container width given in components.css the margin folds into an inline row
 * under the sentence. Source order equals DOM order, so screen readers read sentence then sources.
 */
export function SerhliMetin({ children, etiket }: { children: ReactNode; etiket?: string }) {
  return (
    <div className="kz-serhli" role={etiket ? 'group' : undefined} aria-label={etiket}>
      {children}
    </div>
  );
}

export function SerhSatiri({
  children,
  serh,
  serhEtiketi,
}: {
  /** The sentence or paragraph. */
  children: ReactNode;
  /** Margin content, usually KaynakCipi elements. */
  serh?: ReactNode;
  /** Accessible name of the margin, e.g. "Bu cümlenin kaynakları". */
  serhEtiketi: string;
}) {
  return (
    <div className="kz-serh-satiri">
      <div className="kz-serh-satiri__metin">{children}</div>
      {serh ? (
        <aside className="kz-serh-satiri__serh" aria-label={serhEtiketi}>
          {serh}
        </aside>
      ) : null}
    </div>
  );
}
