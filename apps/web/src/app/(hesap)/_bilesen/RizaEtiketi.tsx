import type { ReactNode } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

const f = tr.form;

/** Label of the terms box with links to both texts; the sentence comes from hesap.json (form.riza). */
export function RizaEtiketi() {
  const bag: Record<string, ReactNode> = {
    kosullar: (
      <a href="/hukuki/kosullar" target="_blank" rel="noopener">
        {f.rizaKosullar}
      </a>
    ),
    aydinlatma: (
      <a href="/hukuki/aydinlatma" target="_blank" rel="noopener">
        {f.rizaAydinlatma}
      </a>
    ),
  };
  return (
    <span>
      {f.riza.split(/(\{\w+\})/).map((parca, i) => {
        const ad = /^\{(\w+)\}$/.exec(parca)?.[1];
        return <span key={i}>{ad && bag[ad] ? bag[ad] : parca}</span>;
      })}
    </span>
  );
}
