import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  AnswerFilters,
  AnswerRequest,
  IngestFetchPayload,
  PrepareRequest,
  QUESTION_TEXT_PATTERN,
  QuestionText,
  aymDecisionTypes,
  courtSources,
  requestBodies,
} from '../src/index.ts';

type Schema = {
  type?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, Schema & { $ref?: string }>;
  items?: Schema;
  enum?: string[];
};
const spec = parse(readFileSync(fileURLToPath(new URL('../openapi.yaml', import.meta.url)), 'utf8')) as {
  components: { schemas: Record<string, Schema> };
};
const schema = (name: string) => spec.components.schemas[name] as Schema;

/** Every C0 control character, DEL and a few neighbours, as single characters. */
const controls = [...Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)), '\u007f'];
const allowed = new Set(['\t', '\n', '\r']);

describe('contract v1.6 (ADR-0038): question text', () => {
  const openapiPattern = new RegExp(schema('QuestionText').pattern ?? '');

  it('refuses C0 controls other than tab and line breaks, and DEL, in zod and OpenAPI alike', () => {
    for (const c of controls) {
      const q = `KVKK ${c} m.11`;
      const want = allowed.has(c);
      expect(QuestionText.safeParse(q).success, `U+${c.charCodeAt(0).toString(16)}`).toBe(want);
      expect(openapiPattern.test(q), `U+${c.charCodeAt(0).toString(16)}`).toBe(want);
    }
    for (const q of ['KVKK m.11 nedir?', 'Yargıtay İçtihadı Birleştirme', 'satır\nsonu', '\u0080    ']) {
      expect(QuestionText.safeParse(q).success, q).toBe(true);
      expect(openapiPattern.test(q), q).toBe(true);
    }
  });

  it('keeps the length limits and is the q of both answer bodies in zod and OpenAPI', () => {
    expect(QuestionText.safeParse('ab').success).toBe(false);
    expect(QuestionText.safeParse('a'.repeat(1001)).success).toBe(false);
    expect(schema('QuestionText')).toMatchObject({ type: 'string', minLength: 3, maxLength: 1000 });
    expect(new RegExp(schema('QuestionText').pattern ?? '').source).toBe(QUESTION_TEXT_PATTERN.source);
    for (const body of ['AnswerRequest', 'PrepareRequest']) {
      expect(schema(body).properties?.q?.$ref).toBe('#/components/schemas/QuestionText');
    }
    expect(AnswerRequest.safeParse({ q: 'abc\u0000\u0001def' }).success).toBe(false);
    expect(PrepareRequest.safeParse({ q: 'abc\u001bdef', provider: 'openrouter', model: 'm' }).success).toBe(
      false,
    );
    expect(requestBodies.createAnswer).toBe(AnswerRequest);
    expect(requestBodies.prepareAnswer).toBe(PrepareRequest);
  });
});

describe('contract v1.6 (ADR-0038): BYOK prepare filters', () => {
  const base = { q: 'KVKK m.11', provider: 'openrouter', model: 'openai/gpt-oss-20b:free' };

  it('PrepareRequest takes the same optional filters as AnswerRequest', () => {
    const filters = { type: 'karar', from: '2020-01-01', to: '2026-11-15', court: 'Yargıtay' };
    expect(PrepareRequest.parse({ ...base, filters }).filters).toEqual(filters);
    expect(PrepareRequest.safeParse(base).success).toBe(true);
    expect(AnswerRequest.parse({ q: base.q, filters }).filters).toEqual(filters);
    for (const bad of [{ kind: 'karar' }, { type: 'roman' }, { from: '01.01.2020' }]) {
      expect(PrepareRequest.safeParse({ ...base, filters: bad }).success, JSON.stringify(bad)).toBe(false);
      expect(AnswerFilters.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('OpenAPI has one closed AnswerFilters schema used by both bodies', () => {
    const f = schema('AnswerFilters');
    expect(f.additionalProperties).toBe(false);
    expect(Object.keys(f.properties ?? {}).sort()).toEqual(Object.keys(AnswerFilters.shape).sort());
    for (const body of ['AnswerRequest', 'PrepareRequest']) {
      expect(schema(body).properties?.filters?.$ref).toBe('#/components/schemas/AnswerFilters');
      expect(schema(body).required).not.toContain('filters');
    }
  });
});

describe('contract v1.6 (ADR-0038): search response', () => {
  it('SearchResponse.degraded is optional, non-empty when present, an open list of leg names', () => {
    const r = schema('SearchResponse');
    expect(r.required).not.toContain('degraded');
    expect(r.properties?.degraded).toMatchObject({
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1, examples: ['vektor'] },
    });
    // Open on purpose (ADR-0038 madde 5): no enum, so a new leg is not a breaking change for clients.
    expect(r.properties?.degraded?.items?.enum).toBeUndefined();
  });
});

describe('contract v1.6 (ADR-0038): ingest.fetch payloads', () => {
  const ok = (p: unknown) => IngestFetchPayload.safeParse(p).success;

  it('accepts the AYM bank ids, which are GUIDs but not RFC 9562 UUIDs', () => {
    // Version digit 0 and variant digit 3: refused by z.uuid(), produced by the bank (tests/fixtures/aym).
    expect(ok({ source: 'aym', kararTipi: 'NormDenetimi', id: '817f0b47-acf1-0404-3232-c313b5441fd4' })).toBe(
      true,
    );
    expect(aymDecisionTypes).toEqual(['BireyselBasvuru', 'NormDenetimi']);
  });

  it('keeps the v1.5 shapes and adds a list shape next to the document shape of five sources', () => {
    expect(ok({ source: 'kvkk', url: 'https://www.kvkk.gov.tr/Icerik/1/karar' })).toBe(true);
    expect(ok({ source: 'kvkk', page: 1 })).toBe(true);
    for (const source of courtSources) {
      expect(ok({ source, unit: 'Genel Kurul', year: 2025, page: 1 })).toBe(true);
      expect(
        ok({ source, id: '1', unit: 'Genel Kurul', esas: '2025/1', karar: '2025/2', date: '2025-01-31' }),
      ).toBe(true);
      // A list page and a document are never mixed in one payload.
      expect(ok({ source, unit: 'Genel Kurul', year: 2025, page: 1, id: '1' })).toBe(false);
    }
  });

  it('accepts ASCII case numbers only, also with the trailing part connectors/judicial.py allows', () => {
    const doc = (esas: string) =>
      ok({ source: 'yargitay', id: '9', unit: 'HGK', esas, karar: '2024/1', date: '2024-01-02' });
    expect(doc('2017/(19)1-1066')).toBe(true);
    expect(doc('2024/5/1')).toBe(true);
    expect(doc('٢٠٢٤/1')).toBe(false);
    expect(doc(`2024/${'1'.repeat(46)}`)).toBe(false);
  });
});
