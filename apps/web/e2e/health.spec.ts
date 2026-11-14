// E2e test of the health checks that the external monitor and the smoke test ask for without a session.
import { expect, test } from './test';

// In the demo there are no databases nor copies: only the content and the images' folder.
test('/api/health/deep answers without a session, and only ok or fail', async ({ request }) => {
  const r = await request.get('/api/health/deep');
  expect(r.status()).toBe(200);
  expect(r.headers()['cache-control']).toBe('no-store');
  const text = await r.text();
  expect(JSON.parse(text)).toEqual({ ok: true, checks: { content: 'ok', media: 'ok' } });
  expect(text).not.toMatch(/e2e|content\.json|http|supabase/i);
  expect(await (await request.get('/api/health')).json()).toEqual({ ok: true });
});
