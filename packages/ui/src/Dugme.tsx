import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.ts';
import { haric } from './haric.ts';

type Ortak = {
  /** birincil: filled ink; ikincil: outlined; sessiz: text only. All keep a 44 px target. */
  tur?: 'birincil' | 'ikincil' | 'sessiz';
  children: ReactNode;
  className?: string;
};
export type DugmeProps =
  | (Ortak & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'>)
  | (Ortak & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>);

/** Button, or a link styled as a button when href is given. Native elements keep keyboard behaviour. */
export function Dugme(props: DugmeProps) {
  const { tur = 'birincil', className, children } = props;
  const sinif = cx('kz-dugme', `kz-dugme--${tur}`, className);
  if (props.href !== undefined) {
    const rest = haric(props, ['tur', 'className', 'children']);
    return (
      <a {...rest} className={sinif}>
        {children}
      </a>
    );
  }
  const rest = haric(props, ['tur', 'className', 'children', 'type']);
  const type = props.type ?? 'button';
  return (
    <button {...rest} type={type} className={sinif}>
      {children}
    </button>
  );
}
