/** Token names exported for type safe use in components. Values live in tokens.css. */
export const tokenNames = [
  '--kz-color-bg',
  '--kz-color-surface',
  '--kz-color-surface-muted',
  '--kz-color-text',
  '--kz-color-text-muted',
  '--kz-color-border',
  '--kz-color-accent',
  '--kz-color-accent-contrast',
  '--kz-color-focus',
  '--kz-color-success',
  '--kz-color-warning',
  '--kz-color-danger',
  '--kz-color-authority-binding',
  '--kz-color-authority-high',
  '--kz-color-authority-precedent',
  '--kz-color-authority-other',
  '--kz-serh-width',
  '--kz-serh-rule',
  '--kz-serh-gap',
  '--kz-font-heading',
  '--kz-font-body',
  '--kz-font-mono',
  '--kz-text-xs',
  '--kz-text-sm',
  '--kz-text-md',
  '--kz-text-lg',
  '--kz-text-xl',
  '--kz-text-2xl',
  '--kz-text-3xl',
  '--kz-leading-tight',
  '--kz-leading-body',
  '--kz-space-1',
  '--kz-space-2',
  '--kz-space-3',
  '--kz-space-4',
  '--kz-space-6',
  '--kz-space-8',
  '--kz-space-12',
  '--kz-space-16',
  '--kz-radius-sm',
  '--kz-radius-md',
  '--kz-radius-lg',
  '--kz-shadow-1',
  '--kz-shadow-2',
  '--kz-content-max',
  '--kz-reading-max',
  '--kz-duration-fast',
  '--kz-duration-base',
  '--kz-ease',
] as const;
export type TokenName = (typeof tokenNames)[number];
export const token = (name: TokenName): string => `var(${name})`;

export { cx } from './cx.ts';
export { contrastRatio } from './kontrast.ts';
export { Dugme, type DugmeProps } from './Dugme.tsx';
export { FormAlani, type FormAlaniProps } from './FormAlani.tsx';
export { Sekmeler, type Sekme } from './Sekmeler.tsx';
export { IletisimKutusu } from './IletisimKutusu.tsx';
export { Etiket, etiketSekli, type EtiketTuru } from './Etiket.tsx';
export { KaynakCipi, type OtoriteSinifi } from './KaynakCipi.tsx';
export { SerhliMetin, SerhSatiri } from './KenarSerhi.tsx';
export { HalkaGrafik } from './HalkaGrafik.tsx';
export { Tablo, type TabloSutunu } from './Tablo.tsx';
export { BosDurum, HataDurumu, Yukleniyor } from './Durumlar.tsx';
