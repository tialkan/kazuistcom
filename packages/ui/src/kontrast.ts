/** WCAG 2.1 contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (hex: string) => {
    const n = hex.replace('#', '');
    const r = channel(parseInt(n.slice(0, 2), 16) / 255);
    const g = channel(parseInt(n.slice(2, 4), 16) / 255);
    const b = channel(parseInt(n.slice(4, 6), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
