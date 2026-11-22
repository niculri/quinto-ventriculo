// Tests the table's columns: what each cell of a card says by its state, and how each column sorts.
import type { SchedTiming } from '@qv/srs';
import { describe, expect, it } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import type { DeckNode } from '../../../catalog/model/tree';
import { cellText, recall, shortDate, sortCards } from '../columns';
import type { ColumnKey } from '../columns';

const NOW = 1_800_000_000;
const TIMING: SchedTiming = { now: NOW, today: 20_833, nextDayAt: NOW + 3600 };
const DAY = 86_400;
const DECK = { name: 'Ramo::Certamen 1', label: 'Certamen 1' } as DeckNode;

const review = (patch: Parameters<typeof browseCard>[0] = {}) =>
  browseCard({
    type: 'review',
    queue: 'review',
    interval: 3,
    stability: 3,
    difficulty: 5.5,
    lastReview: NOW - 3 * DAY,
    decay: 0.5,
    dueAt: NOW + DAY,
    reps: 4,
    lapses: 1,
    ...patch,
  });

describe('what a cell says', () => {
  it.each<[string, Parameters<typeof browseCard>[0], ColumnKey, string]>([
    ['the code with its version', { note: { code: 'T-A1-01', version: 3 } }, 'code', 'T-A1-01.3'],
    [
      'the code of a note without version',
      { note: { code: 'T-A1-01', version: 0 } },
      'code',
      'T-A1-01',
    ],
    ['nothing for a note without code', { note: { code: null } }, 'code', ''],
    ['the deck’s short name', { deck: DECK }, 'deck', 'Certamen 1'],
    ['nothing for a deck that is not in the tree', {}, 'deck', ''],
    ['a new card’s place in the queue', { position: 7 }, 'due', 'Nueva #7'],
    [
      'a new card’s place, in parentheses when suspended',
      { position: 7, queue: 'suspended' },
      'due',
      '(Nueva #7)',
    ],
    ['a new card’s interval', {}, 'interval', '(nueva)'],
    ['a learning card’s interval', { type: 'learn' }, 'interval', '(aprendiendo)'],
    ['nothing for a difficulty never computed', {}, 'difficulty', ''],
    ['the lowest difficulty as 0 %', { difficulty: 1 }, 'difficulty', '0 %'],
    ['the highest difficulty as 100 %', { difficulty: 10 }, 'difficulty', '100 %'],
    ['nothing for a stability never computed', {}, 'stability', ''],
    ['nothing for the recall of a card never reviewed', {}, 'retrievability', ''],
    ['nothing for the creation date of a note without it', {}, 'created', ''],
    ['nothing for a note type that is not in the index', {}, 'noteType', ''],
    ['the tags, by spaces', { tags: ['a::b', 'c'] }, 'tags', 'a::b c'],
    ['the repetitions', { reps: 12 }, 'reps', '12'],
    ['the lapses', { lapses: 2 }, 'lapses', '2'],
    ['the template', { template: 'Cloze 2' }, 'card', 'Cloze 2'],
    ['the sort field', { note: { sortField: 'Atlas' } }, 'sortField', 'Atlas'],
  ])('%s', (_, patch, column, text) => {
    expect(cellText(browseCard(patch), column, TIMING)).toBe(text);
  });

  it('a review card says its interval, stability and recall, and the note type and creation date', () => {
    const c = review({
      noteType: { name: 'Prueba · Básica' } as never,
      createdMs: Date.UTC(2026, 9, 8, 12),
    });
    expect(cellText(c, 'interval', TIMING)).toBe('3 días');
    expect(cellText(c, 'stability', TIMING)).toBe('3 días');
    // After as many days as its stability, the recall is 90 %: that is what FSRS's stability means.
    expect(cellText(c, 'retrievability', TIMING)).toBe('90 %');
    expect(cellText(c, 'difficulty', TIMING)).toBe('50 %');
    expect(cellText(c, 'noteType', TIMING)).toBe('Prueba · Básica');
    expect(cellText(c, 'created', TIMING)).toBe(shortDate(Date.UTC(2026, 9, 8, 12)));
  });

  it('a day card’s due date has no time; a learning card’s has one; a buried one goes in parentheses', () => {
    const at = (NOW + DAY) * 1000;
    const day = shortDate(at);
    expect(cellText(review(), 'due', TIMING)).toBe(day);
    const learning = cellText(review({ intraday: true }), 'due', TIMING);
    expect(learning.startsWith(`${day}, `)).toBe(true);
    expect(learning).toMatch(/\d{2}:\d{2}/);
    expect(cellText(review({ queue: 'buried' }), 'due', TIMING)).toBe(`(${day})`);
    expect(cellText(review({ queue: 'buried' }), 'interval', TIMING)).toBe('3 días');
  });
});

describe('the recall', () => {
  it('is null until the card has stability, difficulty and a last review', () => {
    expect(recall(review({ stability: null }), TIMING)).toBeNull();
    expect(recall(review({ difficulty: null }), TIMING)).toBeNull();
    expect(recall(review({ lastReview: null }), TIMING)).toBeNull();
  });

  it('is full right after a review, also with a review in the future, and falls with the days', () => {
    expect(recall(review({ lastReview: NOW }), TIMING)).toBe(1);
    expect(recall(review({ lastReview: NOW + DAY }), TIMING)).toBe(1);
    const sooner = recall(review({ lastReview: NOW - DAY }), TIMING)!;
    const later = recall(review({ lastReview: NOW - 10 * DAY }), TIMING)!;
    expect(sooner).toBeGreaterThan(0.9);
    expect(later).toBeLessThan(0.9);
  });

  it('takes a decay of 0.5 when the card has none, and a deck’s own decay changes it', () => {
    const none = recall(review({ decay: null, lastReview: NOW - 10 * DAY }), TIMING);
    expect(none).toBe(recall(review({ decay: 0.5, lastReview: NOW - 10 * DAY }), TIMING));
    expect(recall(review({ decay: 0.2, lastReview: NOW - 10 * DAY }), TIMING)).not.toBe(none);
  });
});

const keys = (cards: ReturnType<typeof browseCard>[]) => cards.map((c) => c.noteGuid);
const sorted = (cards: ReturnType<typeof browseCard>[], column: ColumnKey, descending = false) =>
  keys(sortCards(cards, column, descending, TIMING));
const g = (guid: string, patch: Parameters<typeof browseCard>[0] = {}) =>
  browseCard({ ...patch, note: { guid, ...patch.note } });

describe('the sort', () => {
  it('by due puts the new cards last, by their place in the queue', () => {
    const cards = [
      g('new2', { position: 2 }),
      g('due9', { dueAt: 900 }),
      g('new1', { position: 1 }),
      g('due5', { dueAt: 500 }),
    ];
    expect(sorted(cards, 'due')).toEqual(['due5', 'due9', 'new1', 'new2']);
  });

  it('by interval puts the new and learning cards before the reviews, and relearning counts its interval', () => {
    const cards = [
      g('rev', { type: 'review', interval: 9 }),
      g('relearn', { type: 'relearn', interval: 2 }),
      g('learn', { type: 'learn', interval: 50 }),
    ];
    expect(sorted(cards, 'interval')).toEqual(['learn', 'relearn', 'rev']);
  });

  it.each<[ColumnKey, Parameters<typeof browseCard>[0], Parameters<typeof browseCard>[0]]>([
    ['difficulty', { difficulty: 2 }, {}],
    ['stability', { stability: 2 }, {}],
    ['retrievability', { stability: 1, difficulty: 1, lastReview: NOW, decay: 0.5 }, {}],
    ['created', { createdMs: 5 }, {}],
    ['reps', { reps: 1 }, { reps: 0 }],
    ['lapses', { lapses: 1 }, { lapses: 0 }],
  ])('by %s puts the card without a value first', (column, some, none) => {
    expect(sorted([g('some', some), g('none', none)], column)).toEqual(['none', 'some']);
  });

  it('by code puts the notes without code last', () => {
    const cards = [
      g('none', { note: { code: null } }),
      g('b', { note: { code: 'T-B' } }),
      g('a', { note: { code: 'T-A' } }),
    ];
    expect(sorted(cards, 'code')).toEqual(['a', 'b', 'none']);
  });

  it.each<[ColumnKey, Parameters<typeof browseCard>[0], Parameters<typeof browseCard>[0]]>([
    ['deck', { deck: { name: 'B' } as DeckNode }, { deck: { name: 'A' } as DeckNode }],
    ['deck', { deck: { name: 'A' } as DeckNode }, {}],
    ['noteType', { noteType: { name: 'B' } as never }, { noteType: { name: 'A' } as never }],
    ['noteType', { noteType: { name: 'A' } as never }, {}],
    ['card', { template: 'Inversa' }, { template: 'Directa' }],
    ['tags', { tags: ['z'] }, { tags: ['a', 'z'] }],
  ])('by %s sorts the names as text, a missing one first', (column, second, first) => {
    expect(sorted([g('second', second), g('first', first)], column)).toEqual(['first', 'second']);
  });

  it('as text, numbers go by their value and case and accents do not count', () => {
    const cards = [
      g('10', { note: { sortField: 'Vértebra 10' } }),
      g('2', { note: { sortField: 'vertebra 2' } }),
      g('1', { note: { sortField: 'VERTEBRA 1' } }),
    ];
    expect(sorted(cards, 'sortField')).toEqual(['1', '2', '10']);
  });

  it('descending reverses the order, but the ties keep the order they came in', () => {
    const cards = [
      g('a1', { reps: 1 }),
      g('b3', { reps: 3 }),
      g('c1', { reps: 1 }),
      g('d3', { reps: 3 }),
    ];
    expect(sorted(cards, 'reps')).toEqual(['a1', 'c1', 'b3', 'd3']);
    expect(sorted(cards, 'reps', true)).toEqual(['b3', 'd3', 'a1', 'c1']);
    const accents = [
      g('x', { note: { sortField: 'Ápice' } }),
      g('y', { note: { sortField: 'apice' } }),
    ];
    expect(sorted(accents, 'sortField', true)).toEqual(['x', 'y']);
  });

  it('sorts by the value it is given, and leaves the list it got as it was', () => {
    const cards = [g('a', { reps: 1 }), g('b', { reps: 2 })];
    const out = sortCards(cards, 'reps', false, TIMING, (c) => -c.reps);
    expect(keys(out)).toEqual(['b', 'a']);
    expect(keys(cards)).toEqual(['a', 'b']);
  });
});
