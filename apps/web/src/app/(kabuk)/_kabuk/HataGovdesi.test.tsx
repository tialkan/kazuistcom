import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ortak } from '@kazuist/i18n';
import { HataGovdesi } from './HataGovdesi.tsx';

const t = ortak();

describe('error body (app/error.tsx, app/global-error.tsx)', () => {
  it('shows the Turkish text, the digest and the actions, never the error message', () => {
    const hata = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { digest: '4096771' });
    const html = renderToStaticMarkup(<HataGovdesi error={hata} retry={() => {}} />);
    expect(html).toContain(t.durum.hataBaslik);
    expect(html).toContain(t.durum.yenidenDene);
    expect(html).toContain('href="/"');
    expect(html).toContain('4096771');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('ECONNREFUSED');
  });

  it('works for a thrown value that is not an Error', () => {
    const html = renderToStaticMarkup(<HataGovdesi error="x" retry={() => {}} />);
    expect(html).toContain(t.durum.hataAciklama);
    expect(html).not.toContain(t.durum.hataKodu);
  });
});
