import { z } from 'zod';
import { desteKartlari } from '@/app/pratik/_sunucu/api.ts';
import { onizlemeAcik } from '@/app/pratik/_veri/desteler.ts';
import { apiError, json } from '@/server/auth/http.ts';
import { withAuth } from '@/server/auth/guard.ts';

export const dynamic = 'force-dynamic';

const Kimlik = z.object({ id: z.uuid() });

/** GET /v1/decks/{id}/cards: the visible cards of one deck, for a signed in user (contract listDeckCards). */
export const GET = withAuth(
  { rate: { name: 'deck-cards-user', limit: 120, windowSec: 60 } },
  async (_req, _p, _ctx, params) => {
    const kimlik = Kimlik.safeParse(params);
    if (!kimlik.success) return apiError('bad_request');
    const kartlar = desteKartlari(kimlik.data.id, onizlemeAcik());
    return kartlar ? json(kartlar) : apiError('not_found');
  },
);
