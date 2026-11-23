// The content version as the routes read it: kept a few seconds in each isolate, one read at a time, and null when it
// cannot be read.
import type { Dependencies } from '../dependencies';
import type { ReleaseRepository } from '../ports/releases';

export interface ContentVersionReader {
  /** Null without a source or when it cannot be read: the answer then goes in full, without a validator. */
  read(): Promise<string | null>;
  /** After publishing or undoing here: the next request reads it again. */
  forget(): void;
}

export function contentVersionReader(deps: Dependencies): ContentVersionReader {
  let kept: { until: number; version: string } | null = null;
  let reading: Promise<string | null> | null = null;
  // A read that started before `forget` must not keep what it brings.
  let generation = 0;

  const fetchVersion = async (asked: number) => {
    try {
      const version = await deps.contentVersion.current();
      if (asked === generation) kept = { until: Date.now() + deps.contentVersionTtl, version };
      return version;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      if (asked === generation) reading = null;
    }
  };

  return {
    read() {
      if (!deps.configured.contentVersion) return Promise.resolve(null);
      if (kept && kept.until > Date.now()) return Promise.resolve(kept.version);
      reading ??= fetchVersion(generation);
      return reading;
    },
    forget() {
      generation += 1;
      kept = null;
      reading = null;
    },
  };
}

/** The releases as the panel uses them: publishing or undoing in this isolate forgets the version kept. */
export function forgettingReleases(
  releases: ReleaseRepository,
  versions: ContentVersionReader,
): ReleaseRepository {
  const forgets = <R extends { ok: boolean }>(r: R) => {
    if (r.ok) versions.forget();
    return r;
  };
  return {
    ...releases,
    publish: async (input) => forgets(await releases.publish(input)),
    revert: async (id, by) => forgets(await releases.revert(id, by)),
  };
}
