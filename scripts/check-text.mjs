#!/usr/bin/env node
// Fails when a tracked text file contains U+2014 (em dash). plan.md is the only exception.
// Also checks user facing text (packages/i18n, content) against content/yasak-ifadeler.txt.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const EM_DASH = String.fromCharCode(0x2014);
const EXEMPT = new Set(['plan.md', 'pnpm-lock.yaml']);
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|docx|xlsx|pptx|zip|gz|woff2?|ttf|otf|mp4|mov)$/i;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !EXEMPT.has(f) && !BINARY.test(f) && existsSync(f));

const banned = existsSync('content/yasak-ifadeler.txt')
  ? readFileSync('content/yasak-ifadeler.txt', 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  : [];

const problems = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) problems.push(`${file}:${i + 1}: U+2014 is not allowed`);
  });
  if (/^(packages\/i18n|content)\//.test(file) && file !== 'content/yasak-ifadeler.txt') {
    const lower = text.toLocaleLowerCase('tr-TR');
    for (const phrase of banned) {
      if (lower.includes(phrase.toLocaleLowerCase('tr-TR'))) problems.push(`${file}: banned phrase "${phrase}"`);
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`check:text failed with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`check:text ok (${files.length} files).`);
