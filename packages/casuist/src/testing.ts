/**
 * Test and local development entry ("@kazuist/casuist/testing"). Production code never imports it: seedCorpus
 * writes records and chunks straight into an empty database, while production chunks come from the
 * embed.chunks worker (services/worker-py/nlp).
 */
export { seedCorpus } from './seed.ts';
