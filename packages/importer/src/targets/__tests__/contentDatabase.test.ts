// Records the requests contentDatabase() makes through supabase-js, on `public` and on the draft: a change to the
// importer's client must leave the snapshot as it is.
import { afterEach, expect, it, vi } from 'vitest';
import { contentDatabase } from '../contentDatabase';
import type { ContentDatabase } from '../contentDatabase';

afterEach(() => vi.unstubAllGlobals());

it.each(['public', 'draft'] as const)('the calls of contentDatabase(%s)', async (schema) => {
  const calls: unknown[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    calls.push({
      method: req.method,
      path: decodeURIComponent(url.pathname + url.search),
      headers: Object.fromEntries(
        [...req.headers]
          .filter(([k]) => k !== 'x-client-info')
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      body: JSON.parse(await req.text()) as unknown,
    });
    const failing = url.pathname.endsWith('/unpublish_draft');
    return new Response(
      JSON.stringify(failing ? { code: 'P0001', message: 'unpublish_draft: nope' } : { ok: 1 }),
      { status: failing ? 400 : 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  // The same four calls on both schemas (two of them do not exist in the draft), to record the requests.
  const db = contentDatabase(
    { contentUrl: 'https://content.example.test', contentServiceKey: 'service-test-key' },
    schema,
  ) as ContentDatabase;
  const results = [
    await db.rpc('import_state', { assessments: ['a1'], shared: {} }),
    await db.rpc('save_notes', { items: [{ id: 'n1' }] }),
    await db.rpc('reset_draft', {}),
    await db.rpc('unpublish_draft', { kind: 'note', item: 'n1' }),
  ].map((r) => ({ data: r.data, error: r.error?.message ?? null }));
  expect({ calls, results }).toMatchSnapshot();
});
