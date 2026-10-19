import { createHash } from 'node:crypto';

/** plan 8.8: metadata only. There is deliberately no field for prompt, output or key. */
export interface GatewayMetric {
  requestId: string;
  operation: string;
  mode: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  costUsd: number;
  userHash: string;
  outcome: 'ok' | 'cekimser' | 'hata' | 'reddedildi';
  droppedLines?: number;
  errorKind?: string;
}

export type MetricSink = (m: GatewayMetric) => void;

const ALLOWED = new Set<keyof GatewayMetric>([
  'requestId',
  'operation',
  'mode',
  'provider',
  'model',
  'inputTokens',
  'outputTokens',
  'durationMs',
  'costUsd',
  'userHash',
  'outcome',
  'droppedLines',
  'errorKind',
]);

/** Copies only whitelisted fields so a careless caller cannot leak content through extra keys. */
export function sanitizeMetric(m: GatewayMetric): GatewayMetric {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) if (ALLOWED.has(k as keyof GatewayMetric)) out[k] = v;
  return out as unknown as GatewayMetric;
}

export function hashUser(userId: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${userId}`).digest('hex').slice(0, 16);
}

export const jsonLineSink =
  (write: (line: string) => void): MetricSink =>
  (m) =>
    write(JSON.stringify(sanitizeMetric(m)));
