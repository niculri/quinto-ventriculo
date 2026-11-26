// Tests for what was read of the announcements kept in the browser: forward only, never past now, and a blocked storage.
import { describe, expect, it } from 'vitest';
import { localNewsRepository } from '../memory';

const NOW = Date.parse('2026-11-25T12:00:00.000Z');

describe('localNewsRepository', () => {
  it('keeps the later time and never one after now, also in the storage', async () => {
    const storage = window.localStorage;
    storage.clear();
    const repo = localNewsRepository({ storage, now: () => NOW });
    expect(await repo.seenUntil()).toBeNull();
    expect(await repo.markSeen('2026-11-20T12:00:00.000Z')).toBe('2026-11-20T12:00:00.000Z');
    expect(await repo.markSeen('2026-11-19T12:00:00.000Z')).toBe('2026-11-20T12:00:00.000Z');
    expect(await repo.markSeen('2999-01-01T00:00:00.000Z')).toBe('2026-11-25T12:00:00.000Z');
    expect(await localNewsRepository({ storage }).seenUntil()).toBe('2026-11-25T12:00:00.000Z');
    storage.clear();
  });

  it('without a storage, or with one that refuses, it stays in memory', async () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    for (const repo of [localNewsRepository({ storage: blocked }), localNewsRepository()]) {
      expect(await repo.seenUntil()).toBeNull();
      await repo.markSeen('2026-11-20T12:00:00.000Z');
      expect(await repo.seenUntil()).toBe('2026-11-20T12:00:00.000Z');
    }
  });
});
