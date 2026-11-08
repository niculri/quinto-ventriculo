import type { ImportedNote } from '@qv/schema';

/**
 * The web version of a note given the one published before it: the same rule as `save_note()` of the
 * content database (migration …_articles.sql), for the dry-run folder.
 *
 * - Nothing changed (same `hash`): everything stays as it was, also `updatedAt`.
 * - Something changed but not what the reader sees (`versionHash`: the position, the «Ponte a prueba»
 *   links): same version.
 * - What the reader sees changed: the next version, dated now.
 * - First publication as an article (no previous one, or a previous one from before the articles): 1, and
 *   that is its «Creado el».
 * - A note without a web code (no `versionHash`) has no version.
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
