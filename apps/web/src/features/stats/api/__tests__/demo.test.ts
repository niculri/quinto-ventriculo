// Tests the demo's heatmap: a made-up, repeatable past and what is due, for the leaf decks of a course, added to what
// the demo student really did, and the e2e switches (`empty`, `slow`, `error`).
import type { AnkiTreeDeck, Catalog } from '@qv/schema';
import { dayNumber } from '@qv/study';
import type { HeatmapData } from '@qv/study';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { localStudyRepository } from '../../../progress/api/repository';
import { withDemoHistory } from '../demo';

const TODAY = dayNumber('2026-11-10');

const deck = (id: string, over: Partial<AnkiTreeDeck>): AnkiTreeDeck => ({
  ...CATALOG.anki.decks[0]!,
  id,
  name: `Mazo ${id}`,
  parentId: null,
  courseId: 'anatomia-1',
  cardCount: 4,
  ...over,
});

// `a` and `b` are the only leaves of a course with cards: `p` is their parent, `e` is empty and `x` has no course.
const CATALOG_DEMO: Catalog = {
  ...CATALOG,
  anki: {
    ...CATALOG.anki,
    decks: [
      deck('p', {}),
      deck('a', { parentId: 'p' }),
      deck('b', { parentId: 'p' }),
      deck('e', { parentId: 'p', cardCount: 0 }),
      deck('x', { courseId: null }),
    ],
  },
};

const REAL: HeatmapData = {
  days: [
    { day: TODAY, deckId: 'a', answers: 4, practice: 1 },
    { day: TODAY - 500, deckId: 'b', answers: 2, practice: 0 },
  ],
  due: [{ day: TODAY + 1, cards: 5 }],
};
const NOTHING: HeatmapData = { days: [], due: [] };
const REAL_SORTED: HeatmapData = { ...REAL, days: [...REAL.days].sort((x, y) => x.day - y.day) };

function demo({
  real = REAL,
  catalog = async () => CATALOG_DEMO,
  flags = () => [] as string[],
}: {
  real?: HeatmapData;
  catalog?: () => Promise<Catalog>;
  flags?: (() => string[]) | 'browser';
} = {}) {
  const study = localStudyRepository(null);
  const heatmap = vi.fn(async () => real);
  study.heatmap = heatmap;
  const repository =
    flags === 'browser' ? withDemoHistory(study, catalog) : withDemoHistory(study, catalog, flags);
  return { repository, heatmap };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 10, 12));
});
afterEach(() => vi.useRealTimers());

describe('the made-up history', () => {
  it('covers the 420 days before today, for the leaf decks of a course with cards, and the next 60 days due', async () => {
    const { days, due } = await demo({ real: NOTHING }).repository.heatmap(null);
    expect(new Set(days.map((d) => d.deckId))).toEqual(new Set(['a', 'b']));
    expect(Math.min(...days.map((d) => d.day))).toBeGreaterThanOrEqual(TODAY - 420);
    expect(Math.max(...days.map((d) => d.day))).toBe(TODAY - 1);
    expect(days.every((d) => d.answers >= 15 && d.practice === 0)).toBe(true);
    expect(due.map((d) => d.day)).toEqual(Array.from({ length: 61 }, (_, i) => TODAY + i));
    expect(due.every((d) => d.cards > 0)).toBe(true);
  });

  it('studies every one of the last ten days, and skips some of the older ones', async () => {
    const { days } = await demo({ real: NOTHING }).repository.heatmap(null);
    const studied = new Set(days.map((d) => d.day));
    for (let day = TODAY - 10; day < TODAY; day++) expect(studied.has(day)).toBe(true);
    expect(studied.size).toBeLessThan(420);
  });

  it('studies less in January and February, the summer break', async () => {
    const { days } = await demo({ real: NOTHING }).repository.heatmap(null);
    const monthOf = (day: number) => new Date(day * 86_400_000).getUTCMonth();
    const summer = days.filter((d) => monthOf(d.day) <= 1 && d.day < TODAY - 10);
    const rest = days.filter((d) => monthOf(d.day) > 1 && d.day < TODAY - 10);
    expect(summer.length / 59).toBeLessThan(rest.length / 300);
    expect(Math.max(...summer.map((d) => d.answers))).toBeLessThanOrEqual(95);
  });

  it('is the same every time, and asks the catalog only once', async () => {
    const catalog = vi.fn(async () => CATALOG_DEMO);
    const { repository } = demo({ catalog });
    const first = await repository.heatmap(null);
    expect(await repository.heatmap(null)).toEqual(first);
    expect(catalog).toHaveBeenCalledTimes(1);
  });

  it('keeps to the decks asked for, in the past and in what is due', async () => {
    const { repository } = demo({ real: NOTHING });
    const all = await repository.heatmap(null);
    const onlyA = await repository.heatmap(['a']);
    expect(onlyA.days).toEqual(all.days.filter((d) => d.deckId === 'a'));
    expect(onlyA.due.length).toBeGreaterThan(0);
    expect(onlyA.due.length).toBeLessThan(all.due.length);
    expect(all.due).toEqual(expect.arrayContaining(onlyA.due));
    expect(await repository.heatmap([])).toEqual(NOTHING);
  });

  it('is none when the catalog has no leaf deck of a course with cards', async () => {
    const empty: Catalog = {
      ...CATALOG_DEMO,
      anki: { ...CATALOG_DEMO.anki, decks: [deck('x', { courseId: null })] },
    };
    expect(await demo({ catalog: async () => empty }).repository.heatmap(null)).toEqual(
      REAL_SORTED,
    );
  });
});

describe('with the real history', () => {
  it('puts the real days among the made-up ones, in order of day, and adds what is due on the same day', async () => {
    const { repository: invented } = demo({ real: NOTHING });
    const alone = await invented.heatmap(null);
    const { repository, heatmap } = demo();
    const merged = await repository.heatmap(['a', 'b']);
    expect(heatmap).toHaveBeenCalledWith(['a', 'b']);
    expect(merged.days).toEqual([...alone.days, ...REAL.days].sort((x, y) => x.day - y.day));
    expect(merged.days[0]).toEqual(REAL.days[1]);
    const dueOn = (h: HeatmapData, day: number) => h.due.find((d) => d.day === day)?.cards;
    expect(dueOn(merged, TODAY + 1)).toBe(dueOn(alone, TODAY + 1)! + 5);
    expect(dueOn(merged, TODAY + 2)).toBe(dueOn(alone, TODAY + 2));
  });

  it('shows only the real history when the catalog fails, and tries the catalog again the next time', async () => {
    const catalog = vi
      .fn<() => Promise<Catalog>>()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValue(CATALOG_DEMO);
    const { repository } = demo({ catalog });
    expect(await repository.heatmap(null)).toEqual(REAL_SORTED);
    expect((await repository.heatmap(null)).days.length).toBeGreaterThan(REAL.days.length);
    expect(catalog).toHaveBeenCalledTimes(2);
  });
});

describe('the e2e switches', () => {
  it('«empty» gives the real history alone', async () => {
    expect(await demo({ flags: () => ['empty'] }).repository.heatmap(null)).toEqual(REAL);
  });

  it('«error» fails before reading anything', async () => {
    const { repository, heatmap } = demo({ flags: () => ['error'] });
    await expect(repository.heatmap(null)).rejects.toThrow('No se pudo leer tus días de estudio.');
    expect(heatmap).not.toHaveBeenCalled();
  });

  it('«slow» answers a second and a half late', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 12));
    let done = false;
    void demo({ flags: () => ['slow', 'empty'] })
      .repository.heatmap(null)
      .then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('are read from the browser by default, separated by commas', async () => {
    localStorage.setItem('qv-demo-heatmap', 'slow , empty');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 12));
    let result: HeatmapData | null = null;
    void demo({ flags: 'browser' })
      .repository.heatmap(null)
      .then((h) => (result = h));
    await vi.advanceTimersByTimeAsync(1500);
    expect(result).toEqual(REAL);
  });

  it('are none when the browser has none', async () => {
    const { days } = await demo({ flags: 'browser' }).repository.heatmap(null);
    expect(days.length).toBeGreaterThan(REAL.days.length);
  });

  it('are none when the browser’s storage cannot be read', async () => {
    localStorage.setItem('qv-demo-heatmap', 'empty');
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    try {
      const { days } = await demo({ flags: 'browser' }).repository.heatmap(null);
      expect(days.length).toBeGreaterThan(REAL.days.length);
    } finally {
      read.mockRestore();
    }
  });
});
