/** Small geometric marks used by labels and source chips. One stroke weight, no icon font. */
export type SekilAdi =
  | 'daire'
  | 'bos-daire'
  | 'kare'
  | 'bos-kare'
  | 'baklava'
  | 'bos-baklava'
  | 'ucgen'
  | 'unlem'
  | 'cizgili-daire'
  | 'cubuk'
  | 'halka-nokta'
  | 'takvim';

export function Sekil({ ad }: { ad: SekilAdi }) {
  const ortak = { fill: 'currentColor', stroke: 'none' } as const;
  const cizgi = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as const;
  const govde = {
    daire: <circle cx="6" cy="6" r="4.5" {...ortak} />,
    'bos-daire': <circle cx="6" cy="6" r="4.2" {...cizgi} />,
    kare: <rect x="1.5" y="1.5" width="9" height="9" {...ortak} />,
    'bos-kare': <rect x="1.8" y="1.8" width="8.4" height="8.4" {...cizgi} />,
    baklava: <path d="M6 0.8 11.2 6 6 11.2 0.8 6Z" {...ortak} />,
    'bos-baklava': <path d="M6 1.4 10.6 6 6 10.6 1.4 6Z" {...cizgi} />,
    ucgen: <path d="M6 1 11.2 10.6H0.8Z" {...ortak} />,
    unlem: (
      <>
        <path d="M6 1.2 11 10.4H1Z" {...cizgi} />
        <path d="M6 4.6v2.8M6 8.6v0.4" {...cizgi} />
      </>
    ),
    'cizgili-daire': (
      <>
        <circle cx="6" cy="6" r="4.2" {...cizgi} />
        <path d="M3 9 9 3" {...cizgi} />
      </>
    ),
    cubuk: <rect x="1" y="4" width="10" height="4" {...ortak} />,
    'halka-nokta': (
      <>
        <circle cx="6" cy="6" r="4.4" {...cizgi} />
        <circle cx="6" cy="6" r="1.8" {...ortak} />
      </>
    ),
    takvim: (
      <>
        <rect x="1.6" y="2.4" width="8.8" height="8" {...cizgi} />
        <path d="M1.6 5h8.8" {...cizgi} />
      </>
    ),
  }[ad];
  return (
    <svg className="kz-sekil" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      {govde}
    </svg>
  );
}
