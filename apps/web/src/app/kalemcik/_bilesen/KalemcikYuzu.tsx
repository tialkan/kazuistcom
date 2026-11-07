import tr from '@kazuist/i18n/tr/kalemcik.json';

export type Yuz = 'gulen' | 'dusunceli' | 'uzgun' | 'kutlama';

const agiz: Record<Yuz, string> = {
  gulen: 'M38 66 Q50 76 62 66',
  dusunceli: 'M40 70 L60 70',
  uzgun: 'M38 74 Q50 64 62 74',
  kutlama: 'M36 64 Q50 82 64 64 Z',
};

/**
 * Kalemcik, a pencil with a face. The expression follows the tone of the message (plan 10.5/6: faces instead of
 * emoji). The drawing carries the expression in its accessible name and also in the text next to it; nothing
 * depends on colour alone.
 */
export function KalemcikYuzu({ yuz, boyut = 96 }: { yuz: Yuz; boyut?: number }) {
  const ad = tr.kalemcik.yuz[yuz];
  return (
    <svg
      viewBox="0 0 100 130"
      width={boyut}
      height={(boyut * 130) / 100}
      role="img"
      aria-label={ad}
      focusable="false"
    >
      <rect x="28" y="6" width="44" height="14" rx="4" fill="var(--kz-color-text-muted)" />
      <rect x="28" y="22" width="44" height="6" fill="var(--kz-color-border)" />
      <rect
        x="28"
        y="28"
        width="44"
        height="70"
        fill="var(--kz-color-surface)"
        stroke="var(--kz-color-text)"
        strokeWidth="3"
      />
      <path
        d="M28 98 L50 126 L72 98 Z"
        fill="var(--kz-color-surface-muted)"
        stroke="var(--kz-color-text)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M44 114 L50 126 L56 114 Z" fill="var(--kz-color-text)" />
      <circle cx="42" cy="50" r="3.5" fill="var(--kz-color-text)" />
      <circle cx="58" cy="50" r="3.5" fill="var(--kz-color-text)" />
      {yuz === 'uzgun' ? (
        <path
          d="M36 42 L46 45 M64 42 L54 45"
          stroke="var(--kz-color-text)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : null}
      {yuz === 'kutlama' ? (
        <g fill="none" stroke="var(--kz-color-accent)" strokeWidth="3" strokeLinecap="round">
          <path d="M14 20 L20 26 M20 20 L14 26" />
          <path d="M82 14 L88 20 M88 14 L82 20" />
          <path d="M80 100 L86 106 M86 100 L80 106" />
        </g>
      ) : null}
      <path
        d={agiz[yuz]}
        fill={yuz === 'kutlama' ? 'var(--kz-color-text)' : 'none'}
        stroke="var(--kz-color-text)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0 -4)"
      />
    </svg>
  );
}
