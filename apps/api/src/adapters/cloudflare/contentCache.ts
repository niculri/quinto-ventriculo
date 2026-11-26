// The shared cache of the material on Cloudflare's Cache API (`caches.default`, the data center's): no binding, no plan.
// Its keys are URLs outside /api, and the Worker runs before the cache: an entry only comes out through `match` here.
import type { ContentCache } from '../../ports/contentCache';

const PATH = '/__qv-content-cache/';

/** A digest of the key: short, and it says nothing of the request even to someone who could list the cache. */
async function digest(key: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cloudflareContentCache(cache: Cache, origin: string): ContentCache {
  const base = origin.replace(/\/+$/, '');
  const requestOf = async (key: string) => new Request(`${base}${PATH}${await digest(key)}`);
  return {
    async match(key) {
      try {
        const r = await cache.match(await requestOf(key));
        if (!r?.body) return null;
        return {
          body: r.body,
          contentType: r.headers.get('Content-Type') ?? 'application/octet-stream',
        };
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    async put(key, answer, ttlSeconds) {
      try {
        // Only the type and how long the cache keeps it: none of the answer's own headers (Vary, private) go in.
        const stored = new Response(answer.body, {
          headers: {
            'Content-Type': answer.headers.get('Content-Type') ?? 'application/octet-stream',
            'Cache-Control': `max-age=${String(Math.max(1, Math.floor(ttlSeconds)))}`,
          },
        });
        await cache.put(await requestOf(key), stored);
      } catch (e) {
        console.error(e);
      }
    },
  };
}
