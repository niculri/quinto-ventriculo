// E2e test, through the demo server, of an assessment's card index (compressed, behind the session) and of the one
// signature its thumbnails share.
import { expect, test } from './test';

const SESSION = { Authorization: 'Bearer demo-local' };

test('the card browser index and its thumbnails, behind the session', async ({ request }) => {
  const catalog = (await (await request.get('/api/catalog', { headers: SESSION })).json()) as {
    semesters: { courses: { assessments: { id: string; cardIndex?: { hash: string } }[] }[] }[];
  };
  const assessment = catalog.semesters
    .flatMap((s) => s.courses.flatMap((c) => c.assessments))
    .find((a) => a.cardIndex);
  expect(assessment?.id).toBe('anatomia-1/certamen-1');
  const url = `/api/anki/index/${assessment!.id}/${assessment!.cardIndex!.hash}`;

  expect((await request.get(url)).status()).toBe(401);
  const r = await request.get(url, { headers: { ...SESSION, 'Accept-Encoding': 'gzip' } });
  expect(r.status()).toBe(200);
  // Playwright's request decompresses it; the header says it travelled compressed.
  expect(r.headers()['content-encoding']).toBe('gzip');
  const index = (await r.json()) as { notes: { kind: string; thumb: string | null }[] };
  expect(index.notes.length).toBeGreaterThan(0);
  const thumb = index.notes.find((n) => n.kind === 'occlusion')?.thumb ?? '';
  expect(thumb).toMatch(/^cards\/thumb\//);

  const signature = (await (
    await request.get('/api/anki/thumbs', { headers: SESSION })
  ).json()) as {
    query: string;
  };
  const image = await request.get(`/api/media/${thumb}?${signature.query}`);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/webp');
  expect((await request.get(`/api/media/${thumb}`)).status()).toBe(403);
});
