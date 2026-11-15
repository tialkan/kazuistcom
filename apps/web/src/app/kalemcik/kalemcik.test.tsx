import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import tr from '@kazuist/i18n/tr/kalemcik.json';
import { Kalemcik } from './_bilesen/Kalemcik.tsx';
import { SakinKoc } from './_bilesen/SakinKoc.tsx';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const yuzler = Object.values(tr.kalemcik.yuz);
const gorunenYuzler = (m: string) => yuzler.filter((ad) => m.includes(`aria-label="${ad}"`));

describe('Kalemcik without progress data (docs/istekler/yazma-kalemcik-notr-ton.md)', () => {
  it('draws the thoughtful face and no message line while the summary loads', () => {
    // Effects do not run in a static render, so this is the first, loading state of the screen.
    const m = html(<Kalemcik />);
    expect(gorunenYuzler(m)).toEqual([tr.kalemcik.yuz.dusunceli]);
    expect(m).toContain(tr.kalemcik.ad);
    expect(m).toContain('role="status"');
    expect(m).toContain(tr.kalemcik.yukleniyor);
    expect(m).toContain('aria-busy="true"');
    expect(m).not.toContain('…');
    for (const ton of Object.values(tr.kalemcik.ton)) expect(m).not.toContain(ton);
  });
  it('draws the thoughtful face with neither tone label nor message when there is no project', () => {
    const m = html(<SakinKoc />);
    expect(gorunenYuzler(m)).toEqual([tr.kalemcik.yuz.dusunceli]);
    expect(m).toContain('data-koc="sakin"');
    expect(m).not.toMatch(/<p[ >]/);
    expect(m).not.toContain('role="status"');
    expect(m).not.toContain('aria-busy');
    for (const ton of Object.values(tr.kalemcik.ton)) expect(m).not.toContain(ton);
  });
});
