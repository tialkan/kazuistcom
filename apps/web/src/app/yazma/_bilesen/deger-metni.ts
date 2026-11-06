import tr from '@kazuist/i18n/tr/yazma.json';

const t = tr.sablon.denetim;

/** Readable value: numbers with a decimal comma, lists joined, ranges as "min - max". */
export function degerMetni(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  if (typeof v === 'boolean') return v ? tr.sablon.adim2.evet : tr.sablon.adim2.hayir;
  if (Array.isArray(v)) {
    if (
      v.length === 2 &&
      v.every((x) => x === null || typeof x === 'number') &&
      (v[0] !== null || v[1] !== null)
    )
      return `${v[0] ?? ''} - ${v[1] ?? ''}`;
    return v.map(degerMetni).join(', ');
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('missing' in o) return degerMetni(o.missing) || (o.outOfOrder ? t.bolumSirasi : '');
    return Object.values(o).map(degerMetni).join(' - ');
  }
  const s = String(v);
  return (tr.sablon.adim2.sayfaNo as Record<string, string>)[s] ?? s;
}
