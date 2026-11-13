import { describe, expect, it } from 'vitest';
import HukukiBelgeSayfasi, { generateMetadata, generateStaticParams } from '../../hukuki/[belge]/page.tsx';
import { hukukiBelgeler } from '../../_kabuk/rotalar.ts';
import { ortak } from '@kazuist/i18n';

/** ADR-0031 and docs/istekler/hukuk-uyum-p5-tutarlilik.md madde 2: the community rules page is gone. */
describe('/hukuki/[belge]', () => {
  it('no longer lists or routes the community rules', () => {
    expect(hukukiBelgeler as readonly string[]).not.toContain('topluluk');
    expect(generateStaticParams().map((p) => p.belge)).not.toContain('topluluk');
    expect(Object.keys(ortak().hukuki.belge)).not.toContain('topluluk');
  });

  it.each(['topluluk', 'yok-boyle-bir-belge'])('answers %s with a 404', async (belge) => {
    const params = Promise.resolve({ belge });
    await expect(HukukiBelgeSayfasi({ params })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    await expect(generateMetadata({ params })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it('still renders every footer document', async () => {
    for (const belge of hukukiBelgeler) {
      await expect(HukukiBelgeSayfasi({ params: Promise.resolve({ belge }) })).resolves.toBeTruthy();
    }
  });
});
