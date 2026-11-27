'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { logoUrl, sahneKur, type SahneSecenek } from './sahne.ts';
import './karsilama.css';

/** Full-screen welcome scene; `ust` is the right side of the top bar, `children` sit above the scene. */
export function Sahne({
  secenek,
  logoAlt,
  ust,
  children,
}: {
  secenek: SahneSecenek;
  logoAlt: string;
  ust?: ReactNode;
  children?: ReactNode;
}) {
  const kok = useRef<HTMLDivElement>(null);
  const [logo, setLogo] = useState('');
  const { kelime, gunes, yazilar } = secenek;
  const yaziAnahtar = yazilar?.join('|') ?? '';
  useEffect(() => {
    setLogo(logoUrl(2));
    if (!kok.current) return;
    return sahneKur(kok.current, { kelime, gunes, yazilar: yaziAnahtar ? yaziAnahtar.split('|') : [] });
  }, [kelime, gunes, yaziAnahtar]);
  return (
    <div className="kzw" ref={kok} data-gunes={gunes}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="kzw-serap" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves={2} seed={3}>
            <animate
              attributeName="baseFrequency"
              dur="7s"
              values="0.004 0.09;0.006 0.12;0.004 0.09"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale={14} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="kzw-ly kzw-tint" aria-hidden="true" />
      <div className="kzw-ly kzw-l-sun" aria-hidden="true">
        <img className="kzw-isin" src="/karsilama/isin.webp" alt="" />
        <img className="kzw-tas" src="/karsilama/tas.webp" alt="" />
      </div>
      <div className="kzw-ly kzw-l-cl" aria-hidden="true" />
      <div className="kzw-ly kzw-l-dag" aria-hidden="true">
        <img className="kzw-dag" src="/karsilama/dag.webp" alt="" />
        <div className="kzw-haze" />
        <div className="kzw-glow" />
      </div>
      <canvas className="kzw-yazi" aria-hidden="true" />
      <div className="kzw-ly kzw-l-kz" aria-hidden="true">
        <div className="kzw-kazu" />
      </div>
      <div className="kzw-ly kzw-l-wm" aria-hidden="true">
        <div className="kzw-wmbox">{kelime ? <div className="kzw-kelime" /> : null}</div>
      </div>
      <canvas className="kzw-kum" aria-hidden="true" />
      {secenek.yazilar?.length ? (
        <img className="kzw-kalem" src="/karsilama/kalem.webp" alt="" aria-hidden="true" />
      ) : null}
      <div className="kzw-grain" aria-hidden="true" />
      {children}
      <div className="kzw-ust">
        <a href="/">
          {logo ? (
            <img className="kzw-logo" src={logo} alt={logoAlt} />
          ) : (
            <span className="kzw-gizli">{logoAlt}</span>
          )}
        </a>
        {ust}
      </div>
    </div>
  );
}
