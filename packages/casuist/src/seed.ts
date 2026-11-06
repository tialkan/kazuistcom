import { chunkText } from './chunk.ts';
import type { SqlClient } from './sql.ts';
import type { CorpusRecord } from './types.ts';

/**
 * Writes corpus records and their passages into an empty development or test database (records, chunks).
 * masked_text equals the fixture text, which is published anonymised at source; production records get
 * masked_text from anon.run only. Never run against production.
 */
export async function seedCorpus(db: SqlClient, records: readonly CorpusRecord[]): Promise<number> {
  let n = 0;
  for (const r of records) {
    await db.query(
      `INSERT INTO records (id, type, title, court, chamber, esas_no, karar_no, decision_date, authority_class,
         jurisdiction, norm_refs, status, valid_from, valid_to, amended_by, license_basis, live_only, anonymized,
         anonymization_version, source_url, source_key, fetched_at, text, masked_text, openalex_cited_by)
       VALUES ($1, $2::record_type, $3, $4, $5, $6, $7, $8::date, $9::authority_class, $10, $11::jsonb,
         $12::record_status, $13::date, $14::date, $15, $16, $17, $18, $19, $20, $21, $22::timestamptz, $23, $23, $24)
       ON CONFLICT (source_key) DO NOTHING`,
      [
        r.id,
        r.type,
        r.title,
        r.court,
        r.chamber,
        r.esasNo,
        r.kararNo,
        r.date,
        r.authorityClass,
        r.jurisdiction,
        JSON.stringify(r.normRefs),
        r.status,
        r.validFrom,
        r.validTo,
        r.amendedBy,
        r.licenseBasis,
        r.liveOnly ?? false,
        r.anonymized,
        r.anonymizationVersion,
        r.sourceUrl,
        `fikstur:${r.id}`,
        r.fetchedAt,
        r.text,
        r.openalexCitedBy ?? null,
      ],
    );
    for (const c of chunkText(r.id, r.text)) {
      await db.query(
        `INSERT INTO chunks (record_id, seq, section, text, char_start, char_end)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (record_id, seq) DO NOTHING`,
        [r.id, c.seq, c.section, c.text, c.charStart, c.charEnd],
      );
    }
    n++;
  }
  return n;
}
