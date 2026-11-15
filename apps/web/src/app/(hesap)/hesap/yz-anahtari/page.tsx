import type { Metadata } from 'next';
import { platformAiAvailable } from '@kazuist/ai-gateway/config';
import b from '@kazuist/i18n/tr/byok.json' with { type: 'json' };
import { AltSayfa } from '../../_bilesen/AltSayfa';
import { ByokAyarlari } from '../../_bilesen/ByokAyarlari';

export const metadata: Metadata = {
  title: b.sayfa.baslik,
  description: b.sayfa.meta,
  robots: { index: false },
};

/**
 * /hesap/yz-anahtari: BYOK settings (FR-84, plan 8.3). Needs no session: the key is a setting of this browser
 * and never reaches the server, so there is nothing to authorise here. The summary itself still needs sign in.
 */
export default function YzAnahtariPage() {
  return (
    <AltSayfa baslik={b.sayfa.baslik} aciklama={b.sayfa.aciklama}>
      <section aria-labelledby="byok-nasil">
        <h2 id="byok-nasil">{b.nasil.baslik}</h2>
        <ol>
          {[b.nasil['1'], b.nasil['2'], b.nasil['3'], b.nasil['4']].map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
      </section>
      <ByokAyarlari platformYz={platformAiAvailable()} />
    </AltSayfa>
  );
}
