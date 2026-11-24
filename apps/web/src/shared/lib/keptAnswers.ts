// What the API client keeps of each answer that came with a validator: sent back on the next read, and reused as it is
// when the API says nothing changed (a 304), without parsing it again.

/** Enough for the catalog, the decks and the notes of a while of study, with its cards. */
const MOST = 200;

export interface KeptAnswer {
  tag: string;
  data: unknown;
}

export function keptAnswers(most = MOST) {
  const kept = new Map<string, KeptAnswer>();
  // After `forget`, the paths read again since: until then a path skips the browser's copy too.
  let readSince: Set<string> | null = null;

  return {
    /** A read moves it to the end: the oldest is the first to go. */
    get(path: string): KeptAnswer | undefined {
      const k = kept.get(path);
      if (k) {
        kept.delete(path);
        kept.set(path, k);
      }
      return k;
    },
    /** A whole answer: kept with its validator, or dropped if it came without one. */
    keep(path: string, tag: string | null, data: unknown) {
      kept.delete(path);
      readSince?.add(path);
      if (tag === null) return;
      kept.set(path, { tag, data });
      if (kept.size > most) kept.delete(kept.keys().next().value!);
    },
    /** Whether the next read of `path` has to come from the API, past every copy (after `forget`). */
    mustReload: (path: string) => readSince !== null && !readSince.has(path),
    forget() {
      kept.clear();
      readSince = new Set();
    },
  };
}

export type KeptAnswers = ReturnType<typeof keptAnswers>;
