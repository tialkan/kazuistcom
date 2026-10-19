import { expect, it } from 'vitest';
import type { ProviderAdapter } from '../src/index.ts';

it('adapter contract can be implemented by a fake provider', async () => {
  const fake: ProviderAdapter = {
    provider: 'anthropic',
    async *stream() {
      yield '{"t":"son"}';
    },
  };
  const out: string[] = [];
  for await (const c of fake.stream({
    provider: 'anthropic',
    model: 'm',
    system: 's',
    prompt: 'p',
    maxOutputTokens: 1,
  }))
    out.push(c);
  expect(out).toEqual(['{"t":"son"}']);
});
