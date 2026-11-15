import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { WritingProjectCreateInput, WritingProjectInput, requestBodies } from '../src/index.ts';

type Prop = Record<string, unknown>;
type Obj = { required?: string[]; properties: Record<string, Prop> };
const spec = parse(readFileSync(fileURLToPath(new URL('../openapi.yaml', import.meta.url)), 'utf8')) as {
  components: { schemas: Record<string, Obj> };
};

const KEYS = ['type', 'minLength', 'maxLength', 'minimum', 'maximum', 'enum', 'format'] as const;
const rules = (props: Record<string, Prop>) =>
  Object.fromEntries(
    Object.entries(props).map(([k, v]) => [
      k,
      Object.fromEntries(KEYS.filter((x) => x in v).map((x) => [x, v[x]])),
    ]),
  );

const ok = { title: 'Tez', kind: 'tez', targetWords: 60000 };

describe('contract v1.5.1 writing project bodies', () => {
  it('POST uses the create schema and PATCH the partial one', () => {
    expect(requestBodies.createWritingProject).toBe(WritingProjectCreateInput);
    expect(requestBodies.updateWritingProject).toBe(WritingProjectInput);
  });
  it('create requires title, kind and targetWords; deadline is optional', () => {
    expect(WritingProjectCreateInput.safeParse(ok).success).toBe(true);
    expect(WritingProjectCreateInput.safeParse({ ...ok, deadline: '2026-12-07' }).success).toBe(true);
    for (const k of ['title', 'kind', 'targetWords'] as const) {
      const eksik = Object.fromEntries(Object.entries(ok).filter(([ad]) => ad !== k));
      expect(WritingProjectCreateInput.safeParse(eksik).success, k).toBe(false);
    }
    expect(WritingProjectCreateInput.safeParse({}).success).toBe(false);
  });
  it('create trims the title and enforces the server limits', () => {
    expect(WritingProjectCreateInput.parse({ ...ok, title: '  Tez  ' }).title).toBe('Tez');
    for (const bad of [
      { ...ok, title: '   ' },
      { ...ok, title: 'x'.repeat(301) },
      { ...ok, kind: 'roman' },
      { ...ok, targetWords: -1 },
      { ...ok, targetWords: 1.5 },
      { ...ok, targetWords: 2_000_001 },
      { ...ok, deadline: '07.12.2026' },
      { ...ok, deadline: null },
      { ...ok, ekstra: 1 },
    ]) {
      expect(WritingProjectCreateInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it('update is partial, closed and keeps the same rules', () => {
    expect(WritingProjectInput.safeParse({}).success).toBe(true);
    expect(WritingProjectInput.safeParse({ targetWords: 8000 }).success).toBe(true);
    for (const bad of [{ title: ' ' }, { targetWords: 2_000_001 }, { deadline: null }, { ekstra: 1 }]) {
      expect(WritingProjectInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it('OpenAPI states the same required fields and limits as zod', () => {
    const create = spec.components.schemas.WritingProjectCreateInput as Obj;
    const update = spec.components.schemas.WritingProjectInput as Obj;
    expect([...(create.required ?? [])].sort()).toEqual(['kind', 'targetWords', 'title']);
    expect(update.required ?? []).toEqual([]);
    const zc = z.toJSONSchema(WritingProjectCreateInput, { io: 'input' }) as Obj;
    const zu = z.toJSONSchema(WritingProjectInput, { io: 'input' }) as Obj;
    expect(rules(create.properties)).toEqual(rules(zc.properties));
    expect(rules(update.properties)).toEqual(rules(zu.properties));
  });
});
