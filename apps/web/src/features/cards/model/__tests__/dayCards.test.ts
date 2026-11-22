// Tests the cards of a heatmap day: what was answered on a past day (or today, once something was done) and what is
// due on the others, with what keeps a card out of the day.
import type { RatedAnswer, StoredCard } from '@qv/schema/user';
import { cardKey } from '@qv/study';
import type { HeatmapData } from '@qv/study';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import { storedCard } from '../../../../test/fixtures/storedCard';
import type { CardsData } from '../cardsData';
import { dayCardsOf, failedOf } from '../dayCards';

const DAY = 86_400_000;
const TODAY = 20_000;
const at = (day: number, hours = 0) => new Date(day * DAY + hours * 3_600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY * DAY + 10 * 3_600_000);
});
afterEach(() => {
  vi.useRealTimers();
});

const inScope = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

function data(rows: StoredCard[]): CardsData {
  return {
    cards: inScope.map((guid) => browseCard({ note: { guid } })),
    rows,
    prefs: { timeZone: 'UTC', dayStartsAt: 0 },
  } as unknown as CardsData;
}

const answer = (noteGuid: string, rating: 1 | 3, day = TODAY - 2): RatedAnswer => ({
  noteGuid,
  ord: 0,
  rating,
  reviewedAt: at(day, 9),
});

const heat = (days: HeatmapData['days']): HeatmapData => ({ days, due: [] });

const base = { data: data([]), answered: [], heat: heat([]), deckIds: ['20'] };

describe('the cards of a day', () => {
  it('are nothing to show while the day, the data or today are missing', () => {
    expect(dayCardsOf({ ...base, day: null, today: TODAY })).toBeNull();
    expect(dayCardsOf({ ...base, day: TODAY, today: null })).toBeNull();
    expect(dayCardsOf({ ...base, data: undefined, day: TODAY, today: TODAY })).toBeNull();
  });

  it('wait for the answers and the heatmap on a past day or today, but not on a day to come', () => {
    expect(dayCardsOf({ ...base, answered: undefined, day: TODAY - 1, today: TODAY })).toBeNull();
    expect(dayCardsOf({ ...base, heat: undefined, day: TODAY, today: TODAY })).toBeNull();
    const future = dayCardsOf({
      ...base,
      answered: undefined,
      heat: undefined,
      day: TODAY + 1,
      today: TODAY,
    });
    expect(future?.kind).toBe('due');
  });

  it('on a past day are the ones answered then in this scope, with the failed ones and the practice of its decks', () => {
    const answered = [answer('a', 3), answer('b', 1), answer('a', 1), answer('outside', 1)];
    const days = heat([
      { day: TODAY - 2, deckId: '20', answers: 3, practice: 4 },
      { day: TODAY - 2, deckId: '99', answers: 1, practice: 7 },
      { day: TODAY - 3, deckId: '20', answers: 1, practice: 5 },
    ]);
    const out = dayCardsOf({ ...base, answered, heat: days, day: TODAY - 2, today: TODAY });
    expect(out).toEqual({
      day: TODAY - 2,
      kind: 'answered',
      keys: new Set([cardKey({ noteGuid: 'a', ord: 0 }), cardKey({ noteGuid: 'b', ord: 0 })]),
      answers: 3,
      failed: new Set([cardKey({ noteGuid: 'b', ord: 0 }), cardKey({ noteGuid: 'a', ord: 0 })]),
      practice: 4,
    });
  });

  it('on a past day with nothing done are still that day’s answers: none', () => {
    const out = dayCardsOf({ ...base, day: TODAY - 1, today: TODAY });
    expect(out).toMatchObject({ kind: 'answered', answers: 0, practice: 0 });
  });

  it('today are what is due until something is answered or practiced', () => {
    const due = storedCard('a', 0, '20', { due: at(TODAY) });
    const d = data([due]);
    expect(dayCardsOf({ ...base, data: d, day: TODAY, today: TODAY })?.kind).toBe('due');
    const practiced = heat([{ day: TODAY, deckId: '20', answers: 0, practice: 2 }]);
    expect(
      dayCardsOf({ ...base, data: d, heat: practiced, day: TODAY, today: TODAY }),
    ).toMatchObject({
      kind: 'answered',
      practice: 2,
    });
    const answered = [answer('a', 3, TODAY)];
    expect(dayCardsOf({ ...base, data: d, answered, day: TODAY, today: TODAY })).toMatchObject({
      kind: 'answered',
      answers: 1,
    });
  });

  it('on a day to come are the day cards due then, not new, suspended, retired, buried or out of scope', () => {
    const day = TODAY + 3;
    const rows = [
      storedCard('a', 0, '20', { due: at(day) }),
      storedCard('b', 0, '20', { due: at(day), buriedUntil: at(TODAY - 1) }),
      storedCard('c', 0, '20', { due: at(day), interday: false }),
      storedCard('d', 0, '20', { due: at(day), phase: 'new' }),
      storedCard('e', 0, '20', { due: null }),
      storedCard('f', 0, '20', { due: at(day), suspended: true }),
      storedCard('g', 0, '20', { due: at(day), retiredAt: at(TODAY) }),
      storedCard('h', 0, '20', { due: at(day), buriedUntil: at(TODAY + 1) }),
      storedCard('outside', 0, '20', { due: at(day) }),
      storedCard('a', 1, '20', { due: at(day) }),
      storedCard('i', 0, '20', { due: at(day + 1) }),
    ];
    const out = dayCardsOf({ ...base, data: data(rows), day, today: TODAY });
    expect(out).toEqual({
      day,
      kind: 'due',
      keys: new Set([cardKey({ noteGuid: 'a', ord: 0 }), cardKey({ noteGuid: 'b', ord: 0 })]),
      answers: 0,
      failed: new Set(),
      practice: 0,
    });
  });
});

describe('the failed cards the list marks', () => {
  it('are the day’s on an answered day, and the recent ones otherwise', () => {
    const recent = new Set(['r']);
    const failed = new Set(['f']);
    const answered = {
      day: 1,
      kind: 'answered' as const,
      keys: new Set<string>(),
      answers: 1,
      failed,
      practice: 0,
    };
    expect(failedOf(answered, recent)).toBe(failed);
    expect(failedOf({ ...answered, kind: 'due' }, recent)).toBe(recent);
    expect(failedOf(null, recent)).toBe(recent);
    expect(failedOf(null, undefined)).toBeUndefined();
  });
});
