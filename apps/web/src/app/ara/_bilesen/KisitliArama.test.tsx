import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ara from '@kazuist/i18n/tr/ara.json';
import { MemoryBackend, search } from '@kazuist/casuist';
import { fixtureRecords } from '@kazuist/casuist/fixture';
import { KisitliArama } from './KisitliArama.tsx';

describe('degraded search is shown to the visitor (SearchResult.degraded)', () => {
  it('says the results are keyword only when the vector leg could not run', async () => {
    // No embedder: the vector leg is reported as degraded, as in production without the embedding service.
    const res = await search(
      { q: 'kişisel verilerin silinmesi' },
      { backend: new MemoryBackend(fixtureRecords()) },
    );
    expect(res.degraded).toEqual(['vektor']);
    const html = renderToStaticMarkup(<KisitliArama degraded={res.degraded} />);
    expect(html).toContain('data-testid="arama-kisitli"');
    expect(html).toContain(ara.kisitli.vektor.slice(0, 30));
  });

  it('renders nothing when every leg ran', () => {
    expect(renderToStaticMarkup(<KisitliArama degraded={[]} />)).toBe('');
  });
});
