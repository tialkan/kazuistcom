import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as s from './schema/index.ts';

/**
 * Sample data for local development. Everything here is fictitious and anonymous:
 * no real person, no real decision number, example.invalid addresses only.
 */
export async function seed(db: PgDatabase<PgQueryResultHKT>): Promise<void> {
  // Roles come from migration 0003 (kullanici ... yonetici); the seed only assigns them.
  const [user] = await db
    .insert(s.users)
    .values({ email: 'ornek.kullanici@example.invalid', name: 'Ornek Kullanici', emailVerified: true })
    .returning();
  if (!user) throw new Error('seed: user insert failed');
  await db.insert(s.profiles).values({ userId: user.id, targetProfession: 'akademisyen', tone: 'nazik' });
  await db.insert(s.userRoles).values({ userId: user.id, roleId: 'kullanici' });

  const [record] = await db
    .insert(s.records)
    .values({
      type: 'karar',
      title: 'Ornek Daire, E. 0000/1, K. 0000/2 (sahte kayit)',
      court: 'Ornek Mahkeme',
      chamber: '1. Ornek Daire',
      esasNo: '0000/1',
      kararNo: '0000/2',
      decisionDate: '2020-01-01',
      authorityClass: 'emsal',
      jurisdiction: 'TR',
      normRefs: [{ kanunNo: '0000', madde: '1' }],
      status: 'kesinlesti',
      licenseBasis: 'ornek veri',
      liveOnly: false,
      anonymized: true,
      anonymizationVersion: 'ornek-1',
      sourceUrl: 'https://example.invalid/karar/1',
      sourceKey: 'ornek:1',
      fetchedAt: new Date('2026-10-19T00:00:00Z'),
      text: '[Davaci] tarafindan acilan davada [Davali] aleyhine verilen karar ornek amaciyla yazilmistir.',
    })
    .returning();
  if (!record) throw new Error('seed: record insert failed');
  await db.insert(s.chunks).values({
    recordId: record.id,
    seq: 0,
    section: 'gerekce',
    text: record.text,
    charStart: 0,
    charEnd: record.text.length,
  });

  const [deck] = await db
    .insert(s.decks)
    .values({
      slug: 'ornek-deste',
      title: 'Ornek deste',
      subject: 'medeni-hukuk',
      hmgs: true,
      published: true,
    })
    .returning();
  if (!deck) throw new Error('seed: deck insert failed');
  await db.insert(s.featureFlags).values([
    { key: 'kampus', enabled: false, description: 'Turkuaz Kampus modulu' },
    { key: 'byok', enabled: true, description: 'Kendi anahtarinla kullan' },
  ]);
  await db.insert(s.priceTables).values({
    version: 'ornek-2026-10',
    effectiveFrom: new Date('2026-10-19T00:00:00Z'),
    operations: {
      kaynakli_ozet: 2,
      derin_ozet: 60,
      sablon: 30,
      kampus_ozet: 3,
      poster: 4,
      kisaltma: 2,
      kart: 1,
    },
  });
}
