import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  hasJobPayloadSchema,
  jobPayloadExempt,
  jobPayloadSchemas,
  jobTypes,
  parseJobPayload,
  type JobType,
} from '../src/index.ts';

type Cases = { valid: unknown[]; invalid: unknown[] };
const fixtures = Object.entries(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('./fixtures/job-payloads.json', import.meta.url)), 'utf8'),
  ) as Record<string, Cases | string>,
).filter((e): e is [string, Cases] => !e[0].startsWith('_'));

describe('job payload contract (v1.5, ADR-0035)', () => {
  it('every job type has a schema or is listed as exempt, never both', () => {
    const withSchema = Object.keys(jobPayloadSchemas);
    const exempt: readonly string[] = jobPayloadExempt;
    expect([...withSchema, ...exempt].sort()).toEqual([...jobTypes].sort());
    expect(withSchema.filter((t) => exempt.includes(t))).toEqual([]);
  });

  it('the shared fixture covers every type with a schema', () => {
    expect(fixtures.map(([t]) => t).sort()).toEqual(Object.keys(jobPayloadSchemas).sort());
    for (const [, c] of fixtures) {
      expect(c.valid.length).toBeGreaterThan(0);
      expect(c.invalid.length).toBeGreaterThan(0);
    }
  });

  it.each(fixtures)('%s accepts the valid and refuses the invalid fixtures', (type, c) => {
    for (const p of c.valid)
      expect(parseJobPayload(type as JobType, p), JSON.stringify(p)).toMatchObject({ success: true });
    for (const p of c.invalid)
      expect(parseJobPayload(type as JobType, p), JSON.stringify(p)).toEqual({
        success: false,
        reason: 'invalid_payload',
      });
  });

  it('an exempt type has no schema and parses to no_schema', () => {
    for (const t of jobPayloadExempt) {
      expect(hasJobPayloadSchema(t)).toBe(false);
      expect(parseJobPayload(t, {})).toEqual({ success: false, reason: 'no_schema' });
    }
  });

  it('applies defaults and keeps only contract fields', () => {
    const r = parseJobPayload('billing.reconcile', {});
    expect(r).toEqual({ success: true, data: {} });
    const n = parseJobPayload('notify.send', {
      type: 'odeme',
      userId: '00000000-0000-4000-8000-000000000001',
    });
    expect(n.success && n.data.type).toBe('odeme');
  });

  it('never echoes the payload in a failure', () => {
    const r = parseJobPayload('anon.run', { recordId: 'Ahmet Yilmaz' });
    expect(JSON.stringify(r)).not.toContain('Ahmet');
  });
});
