/**
 * Ring chart for a single share (writing goal, credit balance). The number is always printed
 * as text in the middle and in the accessible name; the ring only repeats it.
 */
export function HalkaGrafik({
  deger,
  azami,
  etiket,
  degerMetni,
  boyut = 120,
  tur = 'vurgu',
}: {
  deger: number;
  azami: number;
  /** Accessible and visible caption, e.g. "Bu haftaki yazma hedefi". */
  etiket: string;
  /** Formatted value, e.g. "1.200 / 2.000 kelime". */
  degerMetni: string;
  boyut?: number;
  tur?: 'vurgu' | 'kampus';
}) {
  const oran = azami > 0 ? Math.min(1, Math.max(0, deger / azami)) : 0;
  const r = 44;
  const cevre = 2 * Math.PI * r;
  const yuzde = Math.round(oran * 100);
  return (
    <figure className={`kz-halka kz-halka--${tur}`} style={{ width: boyut }}>
      <svg
        viewBox="0 0 100 100"
        width={boyut}
        height={boyut}
        role="img"
        aria-label={`${etiket}: ${degerMetni}`}
      >
        <circle className="kz-halka__iz" cx="50" cy="50" r={r} />
        <circle
          className="kz-halka__dolgu"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={`${cevre * oran} ${cevre}`}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="55" textAnchor="middle" className="kz-halka__yuzde" aria-hidden="true">
          %{yuzde}
        </text>
      </svg>
      <figcaption className="kz-halka__alt">
        <span className="kz-halka__etiket">{etiket}</span>
        <span className="kz-halka__deger">{degerMetni}</span>
      </figcaption>
    </figure>
  );
}
