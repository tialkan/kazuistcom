import type { ReactNode } from 'react';

export type TabloSutunu<T> = {
  anahtar: string;
  baslik: string;
  hucre: (satir: T) => ReactNode;
  /** Numeric columns align right and use tabular figures. */
  sayisal?: boolean;
};

/**
 * Data table with caption, column headers and row headers (first column).
 * The wrapper scrolls horizontally on narrow screens and is focusable so keyboard users can scroll.
 */
export function Tablo<T>({
  baslik,
  sutunlar,
  satirlar,
  satirAnahtari,
  not,
}: {
  baslik: string;
  sutunlar: TabloSutunu<T>[];
  satirlar: T[];
  satirAnahtari: (satir: T) => string;
  not?: ReactNode;
}) {
  return (
    <div className="kz-tablo" role="region" aria-label={baslik} tabIndex={0}>
      <table>
        <caption>{baslik}</caption>
        <thead>
          <tr>
            {sutunlar.map((s) => (
              <th key={s.anahtar} scope="col" className={s.sayisal ? 'kz-sayisal' : undefined}>
                {s.baslik}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {satirlar.map((satir) => (
            <tr key={satirAnahtari(satir)}>
              {sutunlar.map((s, i) =>
                i === 0 ? (
                  <th key={s.anahtar} scope="row">
                    {s.hucre(satir)}
                  </th>
                ) : (
                  <td key={s.anahtar} className={s.sayisal ? 'kz-sayisal' : undefined}>
                    {s.hucre(satir)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {not ? <div className="kz-tablo__not">{not}</div> : null}
    </div>
  );
}
