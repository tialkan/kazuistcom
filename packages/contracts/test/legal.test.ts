import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  LegalFrontMatter,
  legalBuildProblems,
  legalPdfProblems,
  legalPublishBlockers,
  legalRenderMode,
  splitFrontMatter,
} from '../src/index.ts';

/**
 * Publication gate for content/hukuki (plan 11, ADR-0023). This test is the CI half of the gate:
 * every legal text has a valid front matter, and no text marked `yayinda` has an open marker.
 * The render half (production shows only publishable texts) is legalRenderMode, used by on-yuz.
 */
const root = fileURLToPath(new URL('../../../content/hukuki', import.meta.url));
const files = ['tr', 'en'].flatMap((lang) =>
  readdirSync(join(root, lang))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `${lang}/${f}`),
);

describe('legal publish gate (unit)', () => {
  it('blocks drafts, placeholders and open verification markers', () => {
    expect(legalPublishBlockers({ status: 'yayinda' }, 'Metin.')).toEqual([]);
    expect(legalPublishBlockers({ status: 'taslak' }, 'Metin.')).toEqual(['taslak']);
    expect(legalPublishBlockers({ status: 'yayinda' }, 'Unvan: {{UNVAN}}')).toEqual(['yer_tutucu']);
    expect(legalPublishBlockers({ status: 'yayinda' }, 'MERSIS [DOĞRULANACAK: sicil]')).toEqual([
      'dogrulanacak',
    ]);
  });
  it('production hides every non publishable text, staging shows it with the draft band', () => {
    expect(legalRenderMode({ status: 'taslak' }, 'x', 'production')).toBe('gizli');
    expect(legalRenderMode({ status: 'taslak' }, 'x', 'staging')).toBe('taslak_bandi');
    expect(legalRenderMode({ status: 'yayinda' }, '{{X}}', 'production')).toBe('gizli');
    expect(legalRenderMode({ status: 'yayinda' }, 'x', 'production')).toBe('yayin');
  });
  it('fails the build only for published texts with open markers', () => {
    expect(legalBuildProblems('a.md', { status: 'taslak' }, '{{X}}')).toEqual([]);
    expect(legalBuildProblems('a.md', { status: 'yayinda' }, '{{X}} [DOĞRULANACAK')).toHaveLength(2);
  });
});

describe('content/hukuki', () => {
  it('has legal texts to check', () => expect(files.length).toBeGreaterThan(0));
  it.each(files)('%s has a valid front matter and passes the build gate', (file) => {
    const split = splitFrontMatter(readFileSync(join(root, file), 'utf8'));
    expect(split, 'front matter block').not.toBeNull();
    const fm = LegalFrontMatter.parse(parse(split?.frontMatter ?? ''));
    expect(fm.lang).toBe(file.slice(0, 2));
    expect(fm.binding).toBe(fm.lang === 'tr');
    expect(`${fm.slug}.md`).toBe(file.slice(3));
    expect(legalBuildProblems(file, fm, split?.body ?? '')).toEqual([]);
    expect(legalPdfProblems(file, fm, split?.body ?? '')).toEqual([]);
  });
});
