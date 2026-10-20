import { createElement, type ReactNode } from 'react';

/** Archived node: text, or [tag, attrs, ...children]. Produced by docs/tasarim/casuist-arsiv/donustur.py. */
export type Dugum = string | [string, Record<string, string>, ...Dugum[]];

const izinli = new Set([
  'section',
  'div',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'span',
  'a',
  'strong',
  'em',
  'b',
  'i',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'article',
  'blockquote',
  'details',
  'summary',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'br',
  'nav',
  'footer',
  'header',
  'small',
  'code',
  'sup',
  'sub',
  'figure',
  'figcaption',
  'abbr',
  'time',
  'hr',
]);
const ozellikAdi: Record<string, string> = {
  class: 'className',
  hreflang: 'hrefLang',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  datetime: 'dateTime',
};
const guvenliHref = (h: string) => /^(https?:|mailto:|\/|#)/.test(h);

/**
 * Renders archived Casuist content as React elements. No raw HTML is injected: tags and attributes
 * are whitelisted, links are limited to http(s), mailto and site paths, images become placeholders.
 */
export function DugumGoster({ dugum, yerTutucu }: { dugum: Dugum; yerTutucu: string }): ReactNode {
  if (typeof dugum === 'string') return dugum;
  const [etiket, oz, ...cocuklar] = dugum;
  const kids = cocuklar.map((c, i) => <DugumGoster key={i} dugum={c} yerTutucu={yerTutucu} />);
  if (etiket === 'img') {
    const alt = oz.alt ?? '';
    return (
      <span
        className="casuist-gorsel"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={{ aspectRatio: oz.width && oz.height ? `${oz.width} / ${oz.height}` : undefined }}
      >
        <span aria-hidden="true">{alt || yerTutucu}</span>
      </span>
    );
  }
  if (!izinli.has(etiket)) return <>{kids}</>;
  // An icon-only link of the old site lost its icon; without text it would be an unnamed link.
  if (etiket === 'a' && cocuklar.length === 0) return null;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(oz)) {
    if (k === 'width' || k === 'height' || k === 'alt') continue;
    if (k === 'href') {
      if (!guvenliHref(v)) continue;
      props.href = v;
      if (/^https?:/.test(v)) props.rel = 'noreferrer noopener';
      continue;
    }
    if (k === 'open') {
      props.open = true;
      continue;
    }
    props[ozellikAdi[k] ?? k] = v;
  }
  return createElement(etiket, props, ...(etiket === 'br' || etiket === 'hr' ? [] : kids));
}
