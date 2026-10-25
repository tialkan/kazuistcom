import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { requestBodies, requestBodyExempt } from '../src/index.ts';

type Schema = {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  readOnly?: boolean;
  anyOf?: Schema[];
};
type Op = { operationId: string; requestBody?: { content: Record<string, { schema: Schema }> } };

const spec = parse(readFileSync(fileURLToPath(new URL('../openapi.yaml', import.meta.url)), 'utf8')) as {
  paths: Record<string, Record<string, Op>>;
  components: { schemas: Record<string, Schema> };
};
const resolve = (s: Schema): Schema =>
  s.$ref ? resolve(spec.components.schemas[s.$ref.split('/').pop() as string] as Schema) : s;

const ops = Object.values(spec.paths)
  .flatMap((item) => Object.values(item))
  .filter((op): op is Op & Required<Pick<Op, 'requestBody'>> => typeof op === 'object' && !!op?.requestBody);
const bodyOf = (op: Op): Schema => {
  const media = Object.values(op.requestBody?.content ?? {})[0];
  if (!media) throw new Error(`${op.operationId} has no request body media`);
  return resolve(media.schema);
};
const exempt = new Set<string>(requestBodyExempt);
const checked = ops.filter((op) => !exempt.has(op.operationId));

/** Structural shape: property names (readOnly excluded), required, closed objects, array items. */
function shape(input: Schema): unknown {
  const s = resolve(input);
  const nonNull = s.anyOf?.find((x) => x.type !== 'null');
  if (nonNull) return shape(nonNull);
  if (s.items) return { items: shape(s.items) };
  if (s.properties) {
    const props = Object.entries(s.properties).filter(([, v]) => !resolve(v).readOnly);
    return {
      closed: s.additionalProperties === false,
      required: [...(s.required ?? [])].filter((k) => props.some(([n]) => n === k)).sort(),
      props: Object.fromEntries(props.map(([k, v]) => [k, shape(v)]).sort()),
    };
  }
  if (typeof s.additionalProperties === 'object') return { map: true };
  return 'leaf';
}

function closedEverywhere(input: Schema, path: string, out: string[]): void {
  const s = resolve(input);
  if (s.properties) {
    if (s.additionalProperties !== false) out.push(path);
    for (const [k, v] of Object.entries(s.properties)) closedEverywhere(v, `${path}.${k}`, out);
  }
  if (s.items) closedEverywhere(s.items, `${path}[]`, out);
}

describe('request bodies', () => {
  it('every exempt operation exists and takes a body', () => {
    const withBody = new Set(ops.map((o) => o.operationId));
    for (const id of requestBodyExempt) expect(withBody, id).toContain(id);
  });
  it('every non exempt operation has a zod schema and nothing extra', () => {
    expect(Object.keys(requestBodies).sort()).toEqual(checked.map((o) => o.operationId).sort());
  });
  it('every request body object rejects unknown fields (additionalProperties: false)', () => {
    const open: string[] = [];
    for (const op of checked) closedEverywhere(bodyOf(op), op.operationId, open);
    expect(open).toEqual([]);
  });
  it.each(checked.map((o) => [o.operationId, o] as const))('%s zod matches OpenAPI', (id, op) => {
    const zodSchema = requestBodies[id as keyof typeof requestBodies];
    const json = z.toJSONSchema(zodSchema, { io: 'input', unrepresentable: 'any' }) as Schema;
    expect(shape(json)).toEqual(shape(bodyOf(op)));
  });
});
