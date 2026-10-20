'use client';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type Sekme = { id: string; baslik: string; icerik: ReactNode };

/**
 * WAI-ARIA tabs with automatic activation: arrow keys move and select, Home and End jump.
 * Only the selected tab is in the tab order (roving tabindex).
 */
export function Sekmeler({
  sekmeler,
  etiket,
  baslangic,
}: {
  sekmeler: Sekme[];
  /** Accessible name of the tab list. */
  etiket: string;
  baslangic?: string;
}) {
  const kok = useId();
  const [secili, setSecili] = useState(baslangic ?? sekmeler[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const git = (i: number) => {
    const n = sekmeler.length;
    const hedef = sekmeler[(i + n) % n];
    if (!hedef) return;
    setSecili(hedef.id);
    refs.current[(i + n) % n]?.focus();
  };
  const tus = (e: KeyboardEvent, i: number) => {
    const eylem: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: sekmeler.length - 1,
    };
    const hedef = eylem[e.key];
    if (hedef === undefined) return;
    e.preventDefault();
    git(hedef);
  };

  return (
    <div className="kz-sekmeler">
      <div role="tablist" aria-label={etiket} className="kz-sekmeler__liste">
        {sekmeler.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${kok}-${s.id}-sekme`}
            aria-selected={s.id === secili}
            aria-controls={`${kok}-${s.id}-panel`}
            tabIndex={s.id === secili ? 0 : -1}
            className="kz-sekmeler__sekme"
            onClick={() => setSecili(s.id)}
            onKeyDown={(e) => tus(e, i)}
          >
            {s.baslik}
          </button>
        ))}
      </div>
      {sekmeler.map((s) => (
        <div
          key={s.id}
          role="tabpanel"
          id={`${kok}-${s.id}-panel`}
          aria-labelledby={`${kok}-${s.id}-sekme`}
          hidden={s.id !== secili}
          tabIndex={0}
          className="kz-sekmeler__panel"
        >
          {s.icerik}
        </div>
      ))}
    </div>
  );
}
