import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  halfvec,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authorityClasses, recordStatuses, recordTypes } from '@kazuist/contracts';
import { users } from './auth.ts';
import { createdAt, id, ts, tsvector, updatedAt } from './_common.ts';

export const authorityClass = pgEnum('authority_class', authorityClasses);
export const recordType = pgEnum('record_type', recordTypes);
export const recordStatus = pgEnum('record_status', recordStatuses);
export const protocolStatus = pgEnum('protocol_status', [
  'gerekmez',
  'basvuruldu',
  'imzalandi',
  'reddedildi',
  'canli_federasyon',
]);
export const outcome = pgEnum('outcome', ['bozma', 'onama', 'kabul', 'ret', 'ihlal', 'ihlal_yok']);

/** Common record (SRS 9.5 plus plan 6.3). */
export const records = pgTable(
  'records',
  {
    id: id(),
    type: recordType('type').notNull(),
    title: text('title').notNull(),
    court: text('court'),
    chamber: text('chamber'),
    esasNo: text('esas_no'),
    kararNo: text('karar_no'),
    decisionDate: date('decision_date'),
    authorityClass: authorityClass('authority_class').notNull(),
    authorityConfirmed: boolean('authority_confirmed').notNull().default(false),
    jurisdiction: text('jurisdiction').notNull().default('TR'),
    normRefs: jsonb('norm_refs').$type<{ kanunNo: string; madde: string; fikra?: string; bent?: string }[]>(),
    status: recordStatus('status').notNull().default('bilinmiyor'),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    amendedBy: text('amended_by'),
    licenseBasis: text('license_basis').notNull(),
    protocolStatus: protocolStatus('protocol_status').notNull().default('gerekmez'),
    liveOnly: boolean('live_only').notNull().default(false),
    outcome: outcome('outcome'),
    anonymized: boolean('anonymized').notNull().default(false),
    anonymizationVersion: text('anonymization_version'),
    sourceUrl: text('source_url').notNull(),
    sourceKey: text('source_key').notNull(),
    fetchedAt: ts('fetched_at').notNull(),
    text: text('text').notNull(),
    titleTsv: tsvector('title_tsv').generatedAlwaysAs(sql`to_tsvector('turkish', coalesce("title", ''))`),
    openalexCitedBy: integer('openalex_cited_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('records_source_key_uq').on(t.sourceKey),
    index('records_court_date_idx').on(t.court, t.decisionDate),
    index('records_title_tsv_idx').using('gin', t.titleTsv),
    index('records_esas_trgm_idx').using('gin', sql`${t.esasNo} gin_trgm_ops`),
  ],
);

export const recordVersions = pgTable(
  'record_versions',
  {
    id: id(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    amendedBy: text('amended_by'),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('record_versions_uq').on(t.recordId, t.validFrom)],
);

export const chunks = pgTable(
  'chunks',
  {
    id: id(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    section: text('section'),
    text: text('text').notNull(),
    tsv: tsvector('tsv').generatedAlwaysAs(sql`to_tsvector('turkish', "text")`),
    embedding: halfvec('embedding', { dimensions: 1024 }),
    embeddingModel: text('embedding_model'),
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('chunks_record_seq_uq').on(t.recordId, t.seq),
    index('chunks_tsv_idx').using('gin', t.tsv),
    index('chunks_embedding_hnsw_idx').using('hnsw', t.embedding.op('halfvec_cosine_ops')),
  ],
);

/** Raw fetched documents; stored in object storage, row keeps the pointer and hash. */
export const sourcesRaw = pgTable(
  'sources_raw',
  {
    id: id(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    url: text('url').notNull(),
    objectKey: text('object_key').notNull(),
    sha256: text('sha256').notNull(),
    contentType: text('content_type'),
    fetchedAt: ts('fetched_at').notNull(),
    recordId: uuid('record_id').references(() => records.id),
  },
  (t) => [uniqueIndex('sources_raw_uq').on(t.source, t.externalId, t.sha256)],
);

export const normRefs = pgTable(
  'norm_refs',
  {
    id: id(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    kanunNo: text('kanun_no').notNull(),
    madde: text('madde').notNull(),
    fikra: text('fikra'),
    bent: text('bent'),
    targetRecordId: uuid('target_record_id').references(() => records.id),
    charStart: integer('char_start'),
    charEnd: integer('char_end'),
  },
  (t) => [index('norm_refs_lookup_idx').on(t.kanunNo, t.madde)],
);

/** Doctrine works (articles, books, theses), OpenAlex or manual. */
export const works = pgTable('works', {
  id: id(),
  recordId: uuid('record_id').references(() => records.id),
  openalexId: text('openalex_id').unique(),
  doi: text('doi').unique(),
  title: text('title').notNull(),
  authors: jsonb('authors').$type<string[]>(),
  year: integer('year'),
  venue: text('venue'),
  csl: jsonb('csl'),
  createdAt: createdAt(),
});

export const citationEdgeKind = pgEnum('citation_edge_kind', [
  'atif',
  'bozma',
  'onama',
  'ayni_yonde',
  'aksi_yonde',
]);

export const citationEdges = pgTable(
  'citation_edges',
  {
    id: id(),
    fromRecordId: uuid('from_record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    toRecordId: uuid('to_record_id').references(() => records.id),
    toRaw: text('to_raw').notNull(),
    kind: citationEdgeKind('kind').notNull().default('atif'),
    confidence: real('confidence').notNull(),
    confirmed: boolean('confirmed').notNull().default(false),
    extractor: text('extractor').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('citation_edges_uq').on(t.fromRecordId, t.toRaw, t.kind),
    index('citation_edges_to_idx').on(t.toRecordId),
  ],
);

export const anonymizationSpans = pgTable(
  'anonymization_spans',
  {
    id: id(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    policyVersion: text('policy_version').notNull(),
    entity: text('entity').notNull(),
    mask: text('mask').notNull(),
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
    detector: text('detector').notNull(),
    score: real('score'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: ts('reviewed_at'),
  },
  (t) => [index('anonymization_spans_record_idx').on(t.recordId, t.policyVersion)],
);

export const reviewQueue = pgEnum('review_queue_name', [
  'anonymization',
  'citations',
  'cards',
  'journal-rules',
  'takedowns',
  'kampus-reports',
]);

export const reviewQueueItems = pgTable(
  'review_queue',
  {
    id: id(),
    queue: reviewQueue('queue').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id'),
    payload: jsonb('payload').notNull().default({}),
    priority: integer('priority').notNull().default(0),
    decision: text('decision'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: ts('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('review_queue_open_idx')
      .on(t.queue, t.priority)
      .where(sql`${t.decision} is null`),
  ],
);

export const liveCache = pgTable(
  'live_cache',
  {
    id: id(),
    source: text('source').notNull(),
    queryHash: text('query_hash').notNull(),
    results: jsonb('results').notNull(),
    fetchedAt: ts('fetched_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [uniqueIndex('live_cache_uq').on(t.source, t.queryHash)],
);

/** KVKK to GDPR article mapping (plan K-17). */
export const normMappings = pgTable(
  'norm_mappings',
  {
    id: id(),
    fromNorm: text('from_norm').notNull(),
    toNorm: text('to_norm').notNull(),
    relation: text('relation').notNull(),
    note: text('note'),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('norm_mappings_uq').on(t.fromNorm, t.toNorm)],
);
