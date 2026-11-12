import { createElement, type ReactNode } from 'react';
import { casuistGorselleri, gorselOzellikleri } from './gorseller.ts';

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
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  datetime: 'dateTime',
};
const guvenliHref = (h: string) => /^(https?:|mailto:|\/|#)/.test(h);

export type DugumMetinleri = {
  /** Shown for an archived image that has no local copy. */
  yerTutucu: string;
  /** Alt texts that are UI strings (ortak.json casuist.gorselAlt). */
  gorselAlt: Record<string, string>;
};

function Gorsel({ oz, metin }: { oz: Record<string, string>; metin: DugumMetinleri }): ReactNode {
  const g = oz.src ? casuistGorselleri[oz.src] : undefined;
  const alt = (g?.altAnahtari ? metin.gorselAlt[g.altAnahtari] : undefined) ?? oz.alt ?? '';
  if (!g) {
    return (
      <span
        className="casuist-gorsel"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={{ aspectRatio: oz.width && oz.height ? `${oz.width} / ${oz.height}` : undefined }}
      >
        <span aria-hidden="true">{alt || metin.yerTutucu}</span>
      </span>
    );
  }
  const o = gorselOzellikleri(g, Number(oz.height) || undefined);
  const yukleme = g.oncelikli
    ? ({ loading: 'eager', fetchPriority: 'high' } as const)
    : ({ loading: 'lazy' } as const);
  const img = (
    <img
      className={g.sizes ? 'casuist-resim casuist-resim--akiskan' : 'casuist-resim'}
      src={o.src}
      srcSet={o.webpSrcSet}
      sizes={o.sizes}
      width={o.width}
      height={o.height}
      alt={alt}
      decoding="async"
      {...yukleme}
    />
  );
  if (o.svg) return img;
  return (
    <picture>
      <source type="image/avif" srcSet={o.avifSrcSet} sizes={o.sizes} />
      {img}
    </picture>
  );
}

/**
 * Renders archived Casuist content as React elements. No raw HTML is injected: tags and attributes
 * are whitelisted, links are limited to http(s), mailto and site paths. Images come only from the
 * local copies listed in gorseller.ts; an unknown image becomes a placeholder.
 */
export function DugumGoster({ dugum, metin }: { dugum: Dugum; metin: DugumMetinleri }): ReactNode {
  if (typeof dugum === 'string') return dugum;
  const [etiket, oz, ...cocuklar] = dugum;
  const kids = cocuklar.map((c, i) => <DugumGoster key={i} dugum={c} metin={metin} />);
  if (etiket === 'img') return <Gorsel oz={oz} metin={metin} />;
  if (!izinli.has(etiket)) return <>{kids}</>;
  // An empty header cell (corner of a comparison table) is a data cell, not a nameless header.
  if (etiket === 'th' && cocuklar.length === 0) return <td />;
  // An icon-only link of the old site lost its icon; without text it would be an unnamed link.
  if (etiket === 'a' && cocuklar.length === 0) return null;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(oz)) {
    if (k === 'width' || k === 'height' || k === 'alt' || k === 'src') continue;
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
