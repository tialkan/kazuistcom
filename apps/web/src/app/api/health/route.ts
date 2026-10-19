import { checkHealth } from '@/server/health';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const { status, body } = await checkHealth();
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
