import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { haric } from './haric.ts';

type Ortak = {
  id: string;
  /** Always visible label (wt.133). */
  etiket: string;
  ipucu?: string;
  /** Error text. The live region exists from the first render so screen readers announce changes. */
  hata?: string;
  className?: string;
};
export type FormAlaniProps =
  | (Ortak & { cokSatir?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>)
  | (Ortak & { cokSatir: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>);

/** Labelled text input or textarea with hint and an aria-live error region. */
export function FormAlani(props: FormAlaniProps) {
  const { id, etiket, ipucu, hata, className } = props;
  const ipucuId = `${id}-ipucu`;
  const hataId = `${id}-hata`;
  const describedBy = [ipucu ? ipucuId : null, hata ? hataId : null].filter(Boolean).join(' ') || undefined;
  const ortak = {
    id,
    'aria-invalid': hata ? true : undefined,
    'aria-describedby': describedBy,
    className: 'kz-alan__girdi',
  } as const;
  let girdi;
  if (props.cokSatir) {
    const rest = haric(props, ['id', 'etiket', 'ipucu', 'hata', 'className', 'cokSatir']);
    girdi = <textarea {...rest} {...ortak} />;
  } else {
    const rest = haric(props, ['id', 'etiket', 'ipucu', 'hata', 'className', 'cokSatir']);
    girdi = <input {...rest} {...ortak} />;
  }
  return (
    <div className={cx('kz-alan', hata && 'kz-alan--hatali', className)}>
      <label className="kz-alan__etiket" htmlFor={id}>
        {etiket}
      </label>
      {ipucu ? (
        <p className="kz-alan__ipucu" id={ipucuId}>
          {ipucu}
        </p>
      ) : null}
      {girdi}
      <p className="kz-alan__hata" id={hataId} aria-live="polite">
        {hata ? (
          <>
            <span className="kz-alan__hata-isaret" aria-hidden="true">
              !
            </span>
            {hata}
          </>
        ) : null}
      </p>
    </div>
  );
}
