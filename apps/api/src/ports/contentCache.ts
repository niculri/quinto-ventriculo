// A cache of the material's answers shared by every student: only what is the same for all of them goes in.

/** An answer as it went out: its body (passed on unread) and its type. */
interface CachedAnswer {
  body: ReadableStream<Uint8Array>;
  contentType: string;
}

export interface ContentCache {
  /** Null when there is nothing under `key`, or the cache failed: the answer is then read again. */
  match(key: string): Promise<CachedAnswer | null>;
  put(key: string, answer: Response, ttlSeconds: number): Promise<void>;
}

/** Without one, every answer is read from the content database, as before the cache. */
export const NO_CONTENT_CACHE: ContentCache = {
  match: () => Promise.resolve(null),
  put: () => Promise.resolve(),
};
