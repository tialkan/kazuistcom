'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Modal dialog on the native <dialog> element: the browser makes the rest of the page inert,
 * traps focus and closes on Escape. Focus returns to the element that opened it.
 * Opened only by a user action; never used as an unsolicited popup (wt.45).
 */
export function IletisimKutusu({
  acik,
  kapat,
  baslik,
  kapatEtiketi,
  children,
}: {
  acik: boolean;
  kapat: () => void;
  baslik: string;
  /** Visible text of the close button, from i18n. */
  kapatEtiketi: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onceki = useRef<Element | null>(null);
  const baslikId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (acik && !d.open) {
      onceki.current = document.activeElement;
      d.showModal();
    } else if (!acik && d.open) {
      d.close();
    }
  }, [acik]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const kapandi = () => {
      if (onceki.current instanceof HTMLElement) onceki.current.focus();
      kapat();
    };
    d.addEventListener('close', kapandi);
    return () => d.removeEventListener('close', kapandi);
  }, [kapat]);

  return (
    <dialog ref={ref} className="kz-iletisim" aria-labelledby={baslikId}>
      <div className="kz-iletisim__ust">
        <h2 id={baslikId} className="kz-iletisim__baslik">
          {baslik}
        </h2>
        <button type="button" className="kz-dugme kz-dugme--sessiz" onClick={() => ref.current?.close()}>
          {kapatEtiketi}
        </button>
      </div>
      <div className="kz-iletisim__govde">{children}</div>
    </dialog>
  );
}
