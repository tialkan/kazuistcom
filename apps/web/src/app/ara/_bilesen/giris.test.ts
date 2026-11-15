import { describe, expect, it } from 'vitest';
import { safeNext } from '@/server/auth/page-session';
import { donusAdresi, girisAdresi } from './metin.ts';

/** What /giris does with ?sonra= after Next has decoded the query string once. */
function sonrasi(href: string): string {
  const raw = new URL(href, 'https://kazuist.local').searchParams.get('sonra');
  return safeNext(raw);
}

describe('sign in link from /ara returns to the same search (?sonra=)', () => {
  it('keeps the query and the filters through safeNext', () => {
    const donus = donusAdresi({ q: 'kişisel verilerin silinmesi', type: 'mevzuat', page: '2' });
    expect(donus).toBe('/ara?q=ki%C5%9Fisel%20verilerin%20silinmesi&type=mevzuat&page=2');
    expect(sonrasi(girisAdresi(donus))).toBe(donus);
    expect(new URL(donus, 'https://kazuist.local').searchParams.get('q')).toBe('kişisel verilerin silinmesi');
  });

  it("encodes characters that encodeURIComponent leaves alone (! ' ( ) *), which safeNext rejects", () => {
    const donus = donusAdresi({ q: "TBK m.49 (tazminat) 'manevi'!*" });
    expect(donus).toMatch(/^\/ara\?q=[A-Za-z0-9%._~-]+$/);
    expect(sonrasi(girisAdresi(donus))).toBe(donus);
  });

  it('drops the filters, then the query, to stay within the 200 character limit', () => {
    const uzun = 'ş'.repeat(40);
    const donus = donusAdresi({ q: 'veri', court: uzun });
    expect(donus).toBe('/ara?q=veri');
    expect(donusAdresi({ q: uzun })).toBe('/ara');
    expect(sonrasi(girisAdresi('/ara'))).toBe('/ara');
  });
});
