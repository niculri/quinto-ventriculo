// What the Worker answers outside the API: a missing built file is a 404 that is not cached, so a page asking for the
// files of another version never keeps the app's HTML in their place.
import { describe, expect, it, vi } from 'vitest';
import worker from '../worker';
import type { Env } from '../worker';

function envWithAssets() {
  const fetch = vi.fn(
    async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
  );
  return { env: { ASSETS: { fetch } } as unknown as Env, fetch };
}

const ctx = {} as ExecutionContext;

/** A request as the Worker gets it (the runtime adds `cf`, which these paths do not read). */
const incoming = (url: string) => new Request(url) as Request<unknown, IncomingRequestCfProperties>;

describe('worker outside the API', () => {
  it('answers a built file missing from this version with a 404 that is not cached', async () => {
    const { env, fetch } = envWithAssets();
    const r = await worker.fetch(incoming('https://site.test/assets/index-OLD.js'), env, ctx);
    expect(r.status).toBe(404);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Type')).not.toContain('html');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hands any other path to the static files, which answer with the app', async () => {
    const { env, fetch } = envWithAssets();
    const r = await worker.fetch(incoming('https://site.test/semesters/1'), env, ctx);
    expect(r.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
