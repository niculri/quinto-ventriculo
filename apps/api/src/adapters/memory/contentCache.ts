// The shared cache of the material in memory, for the demo and the tests: what the Cache API does in a Worker.
import type { ContentCache } from '../../ports/contentCache';

export interface MemoryContentCache extends ContentCache {
  /** The keys stored and still in force. */
  keys(): string[];
}

/** `now` in seconds. */
export function memoryContentCache(now: () => number): MemoryContentCache {
  const kept = new Map<string, { until: number; body: Uint8Array; contentType: string }>();
  const live = (key: string) => {
    const entry = kept.get(key);
    if (entry && entry.until > now()) return entry;
    kept.delete(key);
    return null;
  };
  return {
    match(key) {
      const entry = live(key);
      if (!entry) return Promise.resolve(null);
      return Promise.resolve({
        body: new Response(entry.body.slice()).body!,
        contentType: entry.contentType,
      });
    },
    async put(key, answer, ttlSeconds) {
      const body = new Uint8Array(await answer.arrayBuffer());
      kept.set(key, {
        until: now() + ttlSeconds,
        body,
        contentType: answer.headers.get('Content-Type') ?? 'application/octet-stream',
      });
    },
    keys: () => [...kept.keys()].filter((k) => live(k) !== null),
  };
}
