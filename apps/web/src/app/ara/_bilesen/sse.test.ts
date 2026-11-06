import { describe, expect, it } from 'vitest';
import { readSse } from './sse.ts';
import { araAdresi, doldur, etiketTuru, otoriteSekli, tarihTr } from './metin.ts';

function body(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const x of chunks) c.enqueue(enc.encode(x));
      c.close();
    },
  });
}

describe('readSse', () => {
  it('parses frames split across chunks, CRLF, comments and multi line data', async () => {
    const frames = [];
    for await (const f of readSse(
      body([
        'event: kaynak',
        'lar\ndata: {"t":"kay',
        'naklar"}\n\n: yorum\r\n\r\nevent: cumle\r\ndata: a\r\ndata: b\r\n\r\n',
        'data: son',
      ]),
    ))
      frames.push(f);
    expect(frames).toEqual([
      { event: 'kaynaklar', data: '{"t":"kaynaklar"}' },
      { event: 'cumle', data: 'a\nb' },
      { event: 'message', data: 'son' },
    ]);
  });
});

describe('page helpers', () => {
  it('fills templates, formats dates and builds query strings', () => {
    expect(doldur('{toplam} sonuç, {x}', { toplam: 3 })).toBe('3 sonuç, {x}');
    expect(tarihTr('2026-11-07T09:00:00Z')).toBe('07.11.2026');
    // 22:40 UTC on 6 November is 7 November in Türkiye.
    expect(tarihTr('2026-11-06T22:40:00Z')).toBe('07.11.2026');
    expect(tarihTr('2016-04-07')).toBe('07.04.2016');
    expect(tarihTr(null)).toBeNull();
    expect(araAdresi({ q: 'KVKK m.11', type: undefined, page: 2, court: '' })).toBe(
      '/ara?q=KVKK+m.11&page=2',
    );
    expect(araAdresi({})).toBe('/ara');
  });
  it('maps labels and authority classes to distinct marks', () => {
    expect(etiketTuru.anonimlestirildi).toBe('anonim');
    expect(otoriteSekli('baglayici_karar')).toBe('baglayici');
    expect(otoriteSekli('idari_karar')).toBe('diger');
  });
});
