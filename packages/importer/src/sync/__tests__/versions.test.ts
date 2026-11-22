// Tests the web version a note gets in the dry-run folder: when it starts, when it goes up and when it stays.
import type { ImportedNote } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { withVersion } from '../versions';

const note = (over: Partial<ImportedNote> = {}): ImportedNote =>
  ({
    id: 'AP-1',
    hash: 'h1',
    versionHash: 'v1',
    updatedAt: '2026-11-02T00:00:00.000Z',
    ...over,
  }) as ImportedNote;

describe('withVersion', () => {
  it('a note whose content did not change is exactly what was saved, version and dates included', () => {
    const previous = note({
      version: 3,
      publishedAt: '2026-10-01T00:00:00.000Z',
      versionAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    });
    const again = note({ updatedAt: '2026-11-09T00:00:00.000Z' });
    expect(withVersion(again, previous)).toEqual({ ...again, ...previous, hash: 'h1' });
  });

  it('what has no version in the saved note is not given one when nothing changed', () => {
    const previous = note({ versionHash: undefined, updatedAt: '2026-10-20T00:00:00.000Z' });
    const result = withVersion(note({ versionHash: undefined }), previous);
    expect(result).not.toHaveProperty('version');
    expect(result.updatedAt).toBe('2026-10-20T00:00:00.000Z');
  });

  it('a note without a web hash has no version, even if the one before had', () => {
    const result = withVersion(
      note({ hash: 'h2', versionHash: undefined, version: 9 }),
      note({ version: 2 }),
    );
    expect(result).not.toHaveProperty('version');
  });

  it('the first version is 1, dated now, for a new note or a saved one that had none', () => {
    const now = '2026-11-02T00:00:00.000Z';
    const first = { version: 1, publishedAt: now, versionAt: now };
    expect(withVersion(note(), undefined)).toMatchObject(first);
    expect(withVersion(note({ hash: 'h2' }), note({ versionHash: undefined }))).toMatchObject(
      first,
    );
  });

  it('what the reader sees changed: next version, same first publication date, new version date', () => {
    const previous = note({
      hash: 'h0',
      versionHash: 'v0',
      version: 4,
      publishedAt: '2026-10-01T00:00:00.000Z',
      versionAt: '2026-10-20T00:00:00.000Z',
    });
    expect(withVersion(note(), previous)).toMatchObject({
      version: 5,
      publishedAt: '2026-10-01T00:00:00.000Z',
      versionAt: '2026-11-02T00:00:00.000Z',
    });
  });

  it('a saved version without a first publication date gets it from now', () => {
    const previous = note({ hash: 'h0', versionHash: 'v0', version: 2 });
    expect(withVersion(note(), previous)).toMatchObject({
      version: 3,
      publishedAt: '2026-11-02T00:00:00.000Z',
    });
  });

  it('only what the reader does not see changed: the version and its dates stay', () => {
    const previous = note({
      hash: 'h0',
      version: 2,
      publishedAt: '2026-10-01T00:00:00.000Z',
      versionAt: '2026-10-20T00:00:00.000Z',
    });
    const result = withVersion(note(), previous);
    expect(result).toMatchObject({
      version: 2,
      publishedAt: '2026-10-01T00:00:00.000Z',
      versionAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
    });
  });
});
