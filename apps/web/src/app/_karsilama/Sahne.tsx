'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { preload } from 'react-dom';
import { ARALIK, HARFLER, KUM_DESEN, logoUrl, sahneKur, type SahneSecenek } from './sahne.ts';

const KW = HARFLER.reduce((t, h) => t + h[0] + ARALIK, -ARALIK);

/** KAZUIST wordmark drawn by hand as server rendered SVG letters, so it paints before any script runs. */
function Kelime() {
  let ax = 0;
  return (
    <div className="kzw-kelime" style={{ aspectRatio: `${KW}/300` }}>
      {HARFLER.map((h, i) => {
        const x = ax;
        ax += h[0] + ARALIK;
        const id = `kzw-kum-${i}`;
        const boya = (p: string) =>
          h[1] === 's'
            ? { fill: 'none', stroke: p, strokeWidth: 34 }
            : { fill: p, fillRule: h[1] === 'e' ? ('evenodd' as const) : ('nonzero' as const) };
        return (
          <svg
            key={i}
            className="kzw-harf"
            viewBox={`-2 -2 ${h[0] + 4} 304`}
            style={{
              left: `${(x / KW) * 100}%`,
              width: `${((h[0] + 4) / KW) * 100}%`,
              transform: `translateY(${(h[3] / 300) * 100}%)`,
            }}
          >
            <defs>
              <pattern id={id} patternUnits="userSpaceOnUse" width="240" height="52" x={-x}>
                <rect width="240" height="52" fill="#fff" />
                <path d={KUM_DESEN} fill="none" stroke="rgba(205,150,96,.32)" strokeWidth="1.2" />
              </pattern>
            </defs>
            <path d={h[2]} {...boya(`url(#${id})`)} />
          </svg>
        );
      })}
    </div>
  );
}
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
  // The sky is the first paint; fetch it ahead of the stylesheet that names it.
  preload('/karsilama/gok.webp', { as: 'image', fetchPriority: 'high' });
  preload('/karsilama/dag.webp', { as: 'image', fetchPriority: 'high' });
  const kok = useRef<HTMLDivElement>(null);
  const [logo, setLogo] = useState('');
  const { kelime, gunes, yazilar } = secenek;
  const yaziAnahtar = yazilar?.join('|') ?? '';
  useEffect(() => {
    setLogo(logoUrl(2));
    const el = kok.current;
    if (!el) return;
    // Start the motion once the browser is idle, so the first paint and input stay quick.
    let son: (() => void) | undefined;
    const bas = () => {
      son = sahneKur(el, { kelime, gunes, yazilar: yaziAnahtar ? yaziAnahtar.split('|') : [] });
    };
    const bekle = 'requestIdleCallback' in window;
    const id = bekle ? window.requestIdleCallback(bas, { timeout: 1500 }) : window.setTimeout(bas, 300);
    return () => {
      if (bekle) window.cancelIdleCallback(id);
      else clearTimeout(id);
      son?.();
    };
  }, [kelime, gunes, yaziAnahtar]);
  return (
    <div className="kzw" ref={kok} data-gunes={gunes}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="kzw-serap" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves={2} seed={3}>
            <animate
              attributeName="baseFrequency"
              dur="14s"
              values="0.004 0.09;0.005 0.1;0.004 0.09"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale={4} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="kzw-ly kzw-tint" aria-hidden="true" />
      <div className="kzw-ly kzw-l-sun" aria-hidden="true">
        <img className="kzw-isin" data-src="/karsilama/isin.webp" alt="" />
        <img className="kzw-tas" data-src="/karsilama/tas.webp" alt="" />
      </div>
      <div className="kzw-ly kzw-l-cl" aria-hidden="true" />
      {/* mirage strip stays still: it is full width, so a depth shift would show its edges */}
      <div className="kzw-ly kzw-l-serap" aria-hidden="true">
        <div className="kzw-haze" />
        <div className="kzw-glow" />
      </div>
      <div className="kzw-ly kzw-l-dag" aria-hidden="true">
        <img className="kzw-dag" src="/karsilama/dag.webp" alt="" fetchPriority="high" />
      </div>
      <canvas className="kzw-yazi" aria-hidden="true" />
      <div className="kzw-ly kzw-l-kz" aria-hidden="true">
        <div className="kzw-kazu" />
      </div>
      <div className="kzw-ly kzw-l-wm" aria-hidden="true">
        <div className="kzw-wmbox">{kelime ? <Kelime /> : null}</div>
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
