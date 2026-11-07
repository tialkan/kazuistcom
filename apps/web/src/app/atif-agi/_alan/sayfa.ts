export type Parametreler = Record<string, string | string[] | undefined>;

/** Filters and view out of the query string; `gorunum` is a page parameter and is not part of the filter. */
export function sayfaParametreleri(p: Parametreler): { gorunum: 'ag' | 'tablo'; sorgu: URLSearchParams } {
  const sorgu = new URLSearchParams();
  let gorunum: 'ag' | 'tablo' = 'ag';
  for (const [k, v] of Object.entries(p)) {
    const degerler = Array.isArray(v) ? v : v === undefined ? [] : [v];
    if (k === 'gorunum') {
      if (degerler[0] === 'tablo') gorunum = 'tablo';
      continue;
    }
    for (const d of degerler) sorgu.append(k, d);
  }
  return { gorunum, sorgu };
}
