import { kuralSeti } from '../_veri/kurallar.ts';

export const dynamic = 'force-static';

/** The whole prompt as a Markdown download. The file name is plain ASCII. */
export function GET() {
  return new Response(kuralSeti.istem, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="kazuist-yazim-kurallari.md"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
