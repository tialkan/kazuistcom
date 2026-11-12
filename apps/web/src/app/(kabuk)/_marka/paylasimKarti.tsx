import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ortak } from '@kazuist/i18n';
import { amacSatirlari, kenarNotlari, markaRenkleri as r } from './marka.ts';

/**
 * The OpenGraph card, typography only (ADR-0034 option B: no generated imagery). It repeats the
 * signature of the product: the purpose sentence in the reading column and, on the same line, a
 * margin note with the rubric rule (kenar serhi, plan 12/3).
 *
 * Paths are resolved from the app root (apps/web). The route is static, so the files are read once
 * during `next build` and the PNG is served from the build output.
 */
const kok = process.cwd();
const yazi = (ad: string) => readFile(join(kok, 'src/app/(kabuk)/_marka/yazi', ad));

/** Static TTF instances of the subset site fonts; Satori does not read WOFF2. See yazi/NOTICE.txt. */
export async function kartYazilari() {
  const [serif, serifKalin, sans, mono] = await Promise.all([
    yazi('SourceSerif4-Regular.ttf'),
    yazi('SourceSerif4-Semibold.ttf'),
    yazi('KzSans-Medium.ttf'),
    yazi('KzMono-Regular.ttf'),
  ]);
  return [
    { name: 'Source Serif 4', data: serif, weight: 400 as const, style: 'normal' as const },
    { name: 'Source Serif 4', data: serifKalin, weight: 600 as const, style: 'normal' as const },
    { name: 'KzSans', data: sans, weight: 500 as const, style: 'normal' as const },
    { name: 'KzMono', data: mono, weight: 400 as const, style: 'normal' as const },
  ];
}

/** The site icon as a data URI, so the card and the favicon share one drawing (app/icon.svg). */
export async function simgeVerisi(): Promise<string> {
  const svg = await readFile(join(kok, 'src/app/icon.svg'));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

/** Card body. Satori needs `display: flex` on every element with more than one child. */
export function kartGovdesi(simge: string) {
  const o = ortak();
  const satirlar = amacSatirlari(o.amac);
  const notlar = kenarNotlari();
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: r.kagit,
        color: r.murekkep,
        padding: '64px 72px 56px',
        fontFamily: 'Source Serif 4',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Satori renders a plain img; the icon is decorative next to the brand name. */}
        <img src={simge} width={72} height={72} alt="" />
        <span style={{ fontSize: 76, fontWeight: 600, lineHeight: 1, letterSpacing: -1 }}>{o.marka}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {satirlar.map((satir, i) => (
          <div key={satir} style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1, fontSize: 46, lineHeight: 1.35, paddingRight: 28, whiteSpace: 'nowrap' }}>
              {satir}
            </span>
            <div
              style={{
                width: 272,
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'stretch',
                borderLeft: `2px solid ${r.cizgi}`,
                paddingLeft: 28,
              }}
            >
              <span
                style={{
                  fontFamily: 'KzSans',
                  fontWeight: 500,
                  fontSize: 26,
                  borderLeft: `4px solid ${r.lal}`,
                  paddingLeft: 14,
                }}
              >
                {notlar[i] ?? ''}
              </span>
            </div>
          </div>
        ))}
      </div>
      <span style={{ fontFamily: 'KzMono', fontSize: 24, color: r.soluk }}>{o.paylasim.alanAdi}</span>
    </div>
  );
}
