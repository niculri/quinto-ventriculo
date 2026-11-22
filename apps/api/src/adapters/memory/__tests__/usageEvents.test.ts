// Tests for the opens kept in memory: the windows of 31 and 30 days, the grouping and the order of the most opened.
import { describe, expect, it } from 'vitest';
import { memoryUsageEvents } from '../usageEvents';

const NOW = Date.UTC(2026, 10, 19, 12, 30, 0);
const DAY = 86_400_000;

describe('memoryUsageEvents', () => {
  it('records each open at the moment of the clock', async () => {
    let t = NOW;
    const events = memoryUsageEvents({ now: () => t });
    events.record({ kind: 'note', path: '/a' });
    t += 5;
    events.record({ kind: 'note', path: '/a' });
    expect(events.points.map((p) => p.at)).toEqual([NOW, NOW + 5]);
  });

  it('the hours are counted per kind and the most opened go first', async () => {
    const events = memoryUsageEvents({
      now: () => NOW,
      seed: [
        { kind: 'note', path: '/a', at: NOW - 3_600_000 },
        { kind: 'note', path: '/b', at: NOW - 3_600_000 },
        { kind: 'note', path: '/b', at: NOW - 3_000_000 },
        { kind: 'deck', path: '/d', at: NOW - 3_600_000 },
      ],
    });
    const counts = await events.read();
    expect(counts.hourly).toEqual([
      { hour: '2026-11-19T11:00:00.000Z', kind: 'note', count: 3 },
      { hour: '2026-11-19T11:00:00.000Z', kind: 'deck', count: 1 },
    ]);
    expect(counts.items.map((i) => [i.path, i.count])).toEqual([
      ['/b', 2],
      ['/a', 1],
      ['/d', 1],
    ]);
  });

  it('a point from the future or from 31 days back or more is not counted at all', async () => {
    const events = memoryUsageEvents({
      now: () => NOW,
      seed: [
        { kind: 'note', path: '/futuro', at: NOW + 1 },
        { kind: 'note', path: '/viejo', at: NOW - 31 * DAY },
        { kind: 'note', path: '/justo', at: NOW },
      ],
    });
    const counts = await events.read();
    expect(counts.hourly).toHaveLength(1);
    expect(counts.items.map((i) => i.path)).toEqual(['/justo']);
  });

  it('between 30 and 31 days back it still counts for the hours, but not for the most opened or the searches', async () => {
    const events = memoryUsageEvents({
      now: () => NOW,
      seed: [
        { kind: 'note', path: '/a', at: NOW - 30 * DAY - 1 },
        { kind: 'search', path: '/s', context: 'home', at: NOW - 30 * DAY },
      ],
    });
    const counts = await events.read();
    expect(counts.hourly).toHaveLength(2);
    expect(counts.items).toEqual([]);
    expect(counts.searches).toEqual([]);
  });

  it('a point of 29 days and a half is still among the most opened', async () => {
    const events = memoryUsageEvents({
      now: () => NOW,
      seed: [{ kind: 'note', path: '/a', at: NOW - 29.5 * DAY }],
    });
    expect((await events.read()).items.map((i) => i.path)).toEqual(['/a']);
  });

  it('searches are counted by the kind of page, and one without it under an empty one', async () => {
    const events = memoryUsageEvents({
      now: () => NOW,
      seed: [
        { kind: 'search', path: '/s', context: 'home', at: NOW },
        { kind: 'search', path: '/s', context: 'home', at: NOW },
        { kind: 'search', path: '/s', at: NOW },
      ],
    });
    const counts = await events.read();
    expect(counts.searches).toEqual([
      { context: 'home', count: 2 },
      { context: '', count: 1 },
    ]);
    expect(counts.items).toEqual([]);
  });

  it('the most opened are 200 at most', async () => {
    const seed = Array.from({ length: 250 }, (_, i) => ({
      kind: 'deck' as const,
      path: `/d${i}`,
      at: NOW,
    }));
    expect((await memoryUsageEvents({ now: () => NOW, seed }).read()).items).toHaveLength(200);
  });
});
