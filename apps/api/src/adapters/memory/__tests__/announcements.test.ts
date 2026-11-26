// Tests for the announcements in memory: the same rules as the database (wait, one per release, gone with it).
import { describe, expect, it } from 'vitest';
import { memoryAnnouncements } from '../announcements';

const START = Date.parse('2026-11-25T12:00:00Z');
const at = (minutes: number) => new Date(START + minutes * 60_000).toISOString();
const text = { kind: 'new' as const, title: 'T', body: '', items: [] };

describe('memoryAnnouncements', () => {
  it('waits 30 minutes, gives the newest first and at most as many as asked', async () => {
    let now = START;
    const repo = memoryAnnouncements({
      now: () => now,
      releaseStatus: () => Promise.resolve('published'),
    });
    await repo.save({ ...text, releaseId: 1, by: 'x' });
    now += 60_000;
    await repo.save({ ...text, title: 'U', releaseId: 2, by: 'x' });
    expect(await repo.feed(at(29), 10)).toEqual([]);
    expect((await repo.feed(at(40), 10)).map((a) => a.title)).toEqual(['U', 'T']);
    expect((await repo.feed(at(40), 1)).map((a) => a.title)).toEqual(['U']);
    expect((await repo.list()).map((a) => a.title)).toEqual(['U', 'T']);
  });

  it('one per release; none for a release that is not published; undone, it is gone', async () => {
    const log = new Map<number, 'published' | 'reverted'>([[1, 'published']]);
    const repo = memoryAnnouncements({
      now: () => START,
      releaseStatus: (id) => Promise.resolve(log.get(id) ?? null),
    });
    const first = await repo.save({ ...text, releaseId: 1, by: 'x' });
    const again = await repo.save({ ...text, title: 'Otro', releaseId: 1, by: 'y' });
    expect(again).toMatchObject({ id: first !== 'release' ? first.id : 0, title: 'Otro' });
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.save({ ...text, releaseId: 2, by: 'x' })).toBe('release');
    log.set(1, 'reverted');
    expect(await repo.feed(at(60), 10)).toEqual([]);
    expect((await repo.list())[0]!.releaseStatus).toBe('reverted');
  });

  it('withdrawing keeps the first time and hides it; saving again brings it back; one that is missing', async () => {
    let now = START;
    const repo = memoryAnnouncements({ now: () => now });
    const site = await repo.save({ ...text, kind: 'site', releaseId: null, by: 'x' });
    if (site === 'release') throw new Error('unexpected');
    const out = await repo.withdraw(site.id, 'x');
    now += 60_000;
    expect(await repo.withdraw(site.id, 'y')).toEqual(out);
    expect(await repo.feed(at(60), 10)).toEqual([]);
    expect(await repo.withdraw(99, 'x')).toBe('missing');
    const start = memoryAnnouncements({ start: [{ ...(out as typeof site), id: 5 }] });
    expect(await start.save({ ...text, kind: 'site', releaseId: null, by: 'x' })).toMatchObject({
      id: 6,
    });
  });
});
