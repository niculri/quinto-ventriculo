import { expect, test } from '@playwright/test';

// Step 2.5: the external monitor asks /api/health/deep without a session. In the demo there are no databases nor
// copies: only the content and the images' folder, each with «ok» or «fail» and nothing else.
test('/api/health/deep answers without a session, and only ok or fail', async ({ request }) => {
  const r = await request.get('/api/health/deep');
  expect(r.status()).toBe(200);
  expect(r.headers()['cache-control']).toBe('no-store');
  const text = await r.text();
  expect(JSON.parse(text)).toEqual({ ok: true, checks: { content: 'ok', media: 'ok' } });
  expect(text).not.toMatch(/e2e|content\.json|http|supabase/i);
  // The short one, for the smoke test, does not change.
  expect(await (await request.get('/api/health')).json()).toEqual({ ok: true });
});
