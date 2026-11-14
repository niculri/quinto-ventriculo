// The web version of a note for the dry-run folder, by the same rule as the content database's `save_note()`.
import type { ImportedNote } from '@qv/schema';

/**
 * Same `hash`: nothing changes, not even `updatedAt`. Only a new `versionHash` (what the reader sees) gives the next
 * version, dated now; the first one is 1. A note without `versionHash` has no version.
 */
export function withVersion(note: ImportedNote, previous: ImportedNote | undefined): ImportedNote {
  const { version: _v, publishedAt: _p, versionAt: _a, ...base } = note;
  if (previous && previous.hash === note.hash) {
    return { ...base, ...versionOf(previous), updatedAt: previous.updatedAt };
  }
  if (!note.versionHash) return base;
  const now = note.updatedAt;
  if (!previous?.version) return { ...base, version: 1, publishedAt: now, versionAt: now };
  if (previous.versionHash !== note.versionHash) {
    return {
      ...base,
      version: previous.version + 1,
      publishedAt: previous.publishedAt ?? now,
      versionAt: now,
    };
  }
  return { ...base, ...versionOf(previous) };
}

function versionOf(n: ImportedNote): Pick<ImportedNote, 'version' | 'publishedAt' | 'versionAt'> {
  return {
    ...(n.version ? { version: n.version } : {}),
    ...(n.publishedAt ? { publishedAt: n.publishedAt } : {}),
    ...(n.versionAt ? { versionAt: n.versionAt } : {}),
  };
}
