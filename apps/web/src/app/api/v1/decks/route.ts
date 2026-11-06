import { desteListesi } from '@/app/pratik/_sunucu/api.ts';
import { onizlemeAcik } from '@/app/pratik/_veri/desteler.ts';
import { json } from '@/server/auth/http.ts';
import { withPublic } from '@/server/auth/guard.ts';

export const dynamic = 'force-dynamic';

/** GET /v1/decks: the decks and the number of cards a learner can see (contract listDecks). */
export const GET = withPublic({ name: 'decks-ip', limit: 120, windowSec: 60 }, async () =>
  json(desteListesi(onizlemeAcik()), 200, { 'Cache-Control': 'public, max-age=60' }),
);
