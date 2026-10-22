import { expect, test, type APIRequestContext } from '@playwright/test';
import { base, bearer, kayit, type Kullanici } from './yardim.ts';
import { bombaDocx, cokGirdiliDocx, kucukDocx, xxeDocx, zipSlipDocx } from './zip.ts';

/**
 * Upload attacks (plan 5.6/4): type allow list, 20 MB limit, zip bomb (entry count and expanded size),
 * type spoofing, XML entity expansion, zip slip. The two multipart endpoints of the contract
 * (POST /v1/templates/rules, POST /v1/writing-projects/{id}/docx-count) belong to the yazma module of
 * Wave 2. While an endpoint answers 404 the attacks are skipped and the gate report records them as
 * "not run". As soon as the route exists, every case below runs and must be refused without a 5xx.
 */
const ENDPOINTS = [
  { name: 'templates/rules', path: '/api/v1/templates/rules', field: 'file' },
  {
    name: 'writing-projects docx-count',
    path: '/api/v1/writing-projects/00000000-0000-4000-8000-000000000000/docx-count',
    field: 'file',
  },
];

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Probe without a multipart body: Next.js answers a multipart POST to a missing route with
 * 409 "Server Action unavailable", which would look like a live endpoint.
 */
async function exists(request: APIRequestContext, path: string, u: Kullanici): Promise<boolean> {
  const r = await request.post(path, { headers: bearer(u) });
  return r.status() !== 404 && r.status() !== 405;
}

for (const ep of ENDPOINTS) {
  test.describe(`upload attacks: ${ep.name}`, () => {
    let u: Kullanici;
    let live = false;
    test.beforeAll(async ({ request, baseURL }) => {
      u = await kayit(request, baseURL);
      live = await exists(request, ep.path, u);
    });

    const send = (request: APIRequestContext, name: string, mimeType: string, buffer: Buffer) =>
      request.post(ep.path, {
        headers: bearer(u),
        multipart: { [ep.field]: { name, mimeType, buffer } },
        timeout: 60_000,
      });

    const refused = (status: number) => expect([400, 413, 415, 422]).toContain(status);

    test('control: a small valid DOCX is accepted', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      expect((await send(request, 'kontrol.docx', DOCX, kucukDocx())).status()).toBeLessThan(300);
    });

    test('zip bomb (300 MB expanded) is refused', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      refused((await send(request, 'bomba.docx', DOCX, bombaDocx())).status());
    });

    test('20 000 entries are refused', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      refused((await send(request, 'cok.docx', DOCX, cokGirdiliDocx())).status());
    });

    test('a file above 20 MB is refused', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      refused((await send(request, 'buyuk.docx', DOCX, Buffer.alloc(21 * 1024 * 1024, 0x41))).status());
    });

    test('type spoofing: an executable named .docx is refused', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]), Buffer.alloc(4096)]);
      refused((await send(request, 'sahte.docx', DOCX, elf)).status());
    });

    test('type spoofing: HTML with a DOCX content type is refused', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      refused((await send(request, 'x.docx', DOCX, Buffer.from('<script>alert(1)</script>'))).status());
    });

    test('a type outside the allow list is refused', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      refused(
        (await send(request, 'x.svg', 'image/svg+xml', Buffer.from('<svg onload="alert(1)"/>'))).status(),
      );
    });

    test('XML entity expansion and external entities are not resolved', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      const res = await send(request, 'xxe.docx', DOCX, xxeDocx());
      expect(res.status()).toBeLessThan(500);
      expect(await res.text()).not.toMatch(/root:|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
    });

    test('zip slip entry names are refused or ignored', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      expect((await send(request, 'slip.docx', DOCX, zipSlipDocx())).status()).toBeLessThan(500);
    });

    test('signed out upload is 401', async ({ request }) => {
      test.skip(!live, `${ep.path} not implemented yet (404)`);
      const r = await request.post(ep.path, {
        multipart: { [ep.field]: { name: 'k.docx', mimeType: DOCX, buffer: kucukDocx() } },
      });
      expect(r.status()).toBe(401);
    });
  });
}

test('JSON endpoints refuse oversized bodies without a 5xx', async ({ request, baseURL }) => {
  const u = await kayit(request, baseURL);
  const big = 'x'.repeat(2 * 1024 * 1024);
  const r = await request.patch('/api/v1/me', {
    headers: { ...bearer(u), origin: base(baseURL) },
    data: { name: big },
  });
  expect([400, 413]).toContain(r.status());
});
