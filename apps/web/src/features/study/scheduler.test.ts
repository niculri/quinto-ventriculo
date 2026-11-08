import { describe, expect, it } from 'vitest';
import { defaultConfig, newCard } from '@qv/srs';
import type { CardRecord } from '@qv/srs';
import { CATALOG, DECK } from '../../test/render';
import { blankRow } from './session';
import { defaultPreferences } from './repository';
import {
  presetChoices,
  subtree,
  treeDecks,
  presetOf,
  siblingsToBury,
  studiedToday,
  toRecord,
  toStateFields,
} from './scheduler';
import type { StudyData } from './scheduler';
import { EMPTY_PLAN } from './simple';

const prefs = defaultPreferences('America/Santiago');

describe('rows ↔ the scheduler’s cards', () => {
  const base: Omit<CardRecord, 'phase' | 'queue' | 'due'> = {
    interval: 12,
    remainingSteps: 0,
    stability: 13.2,
    difficulty: 5.4,
    reps: 4,
    lapses: 1,
    lastReview: 1_793_490_330,
  };

  it.each([
    ['a review (a day)', { ...base, phase: 'review', queue: 'review', due: 20_770 }],
    [
      'a learning step today (a moment)',
      { ...base, phase: 'learning', queue: 'learn', due: 1_793_491_000, interval: 0 },
    ],
    [
      'a learning step on another day',
      { ...base, phase: 'relearning', queue: 'dayLearn', due: 20_760, remainingSteps: 1 },
    ],
  ] as [string, CardRecord][])('%s goes and comes back the same', (_, record) => {
    const fields = toStateFields(record, prefs, { suspended: false, leech: false });
    const row = { ...blankRow({ noteGuid: 'n', ord: 0, deckId: '20' }), ...fields };
    expect(toRecord(row, prefs)).toEqual(record);
  });

  it('a review is saved at the start of its day, at the rollover hour', () => {
    const fields = toStateFields(
      { ...base, phase: 'review', queue: 'review', due: 20_758 },
      prefs,
      { suspended: false, leech: false },
    );
    // Day 20758 = 2026-11-01; 4:00 in Santiago (−03) = 07:00 UTC.
    expect(fields.due).toBe('2026-11-01T07:00:00.000Z');
    expect(fields.interday).toBe(true);
  });

  it('a review keeps its day when the day starts at another hour or the zone changes', () => {
    const fields = toStateFields(
      { ...base, phase: 'review', queue: 'review', due: 20_758 },
      prefs,
      { suspended: false, leech: false },
    );
    const row = { ...blankRow({ noteGuid: 'n', ord: 0, deckId: '20' }), ...fields };
    for (const other of [
      { ...prefs, dayStartsAt: 5 },
      { ...prefs, dayStartsAt: 0 },
      { ...prefs, dayStartsAt: 11 },
      { ...prefs, timeZone: 'America/Los_Angeles' },
      { ...prefs, timeZone: 'Europe/Madrid', dayStartsAt: 6 },
      { ...prefs, timeZone: 'UTC' },
    ]) {
      expect(toRecord(row, other)?.due, JSON.stringify(other)).toBe(20_758);
    }
  });

  it('a card with no row, or new, is new', () => {
    expect(toRecord(undefined, prefs)).toBeNull();
    expect(toRecord(blankRow({ noteGuid: 'n', ord: 0, deckId: '20' }), prefs)).toBeNull();
    expect(newCard(0).queue).toBe('new');
  });
});

describe('presets and the deck tree', () => {
  it('the catalog’s tree, and a deck with the decks below it by name', () => {
    const decks = treeDecks(CATALOG.anki.decks);
    expect(subtree(decks, '20').map((d) => [d.label, d.authorPreset])).toEqual([
      ['Mazo de prueba', 'Default'],
      ['Extras', 'Extras'],
    ]);
    expect(subtree(decks, '4').map((d) => d.label)).toEqual([
      'Certamen 1',
      'S1 - Semana de prueba',
      'Mazo de prueba',
      'Extras',
    ]);
    expect(subtree(decks, '1')).toHaveLength(7);
  });

  it('a deck uses its author’s preset, the user’s version of it, or what the user chose', () => {
    const replaced = presetChoices(DECK.presets, [
      { id: 'u1', name: 'Default', replaces: 'Default', config: { newPerDay: 3 }, updatedAt: '' },
      { id: 'u2', name: 'Mía', replaces: null, config: { newPerDay: 7 }, updatedAt: '' },
    ]);
    expect(presetOf('20', 'Default', replaced, []).config.newPerDay).toBe(3);
    expect(presetOf('21', 'Extras', replaced, []).config.newPerDay).toBe(0);
    expect(
      presetOf('21', 'Extras', replaced, [{ deckId: '21', presetId: 'u2', authorPreset: null }])
        .name,
    ).toBe('Mía');
    // A preset that no longer exists: back to the deck's own.
    expect(
      presetOf('21', 'Extras', replaced, [{ deckId: '21', presetId: 'zz', authorPreset: null }])
        .name,
    ).toBe('Extras');
  });
});

describe('the day and the siblings', () => {
  it('counts today’s answers per deck as Anki does (interday learning counts as a review)', () => {
    expect(
      studiedToday(
        [
          { deckId: '20', queueBefore: 'new' },
          { deckId: '20', queueBefore: 'learn' },
          { deckId: '20', queueBefore: 'day_learn' },
          { deckId: '21', queueBefore: 'review' },
        ],
        treeDecks(CATALOG.anki.decks),
      ),
    ).toEqual(
      new Map([
        // What was studied in a deck counts in every deck above it too (up to the root).
        ...['1', '2', '3', '4', '5', '20'].map(
          (id) => [id, { newCount: 1, reviewCount: 2 }] as const,
        ),
        ['21', { newCount: 0, reviewCount: 1 }],
      ]),
    );
  });

  it('an answer buries the siblings the preset says, not those gathered before it', () => {
    const data: StudyData = {
      deck: DECK,
      decks: treeDecks(CATALOG.anki.decks),
      authorPresets: DECK.presets,
      rows: new Map(),
      answers: [],
      prefs: { ...prefs, fullAnki: true },
      presets: [],
      settings: [],
      plan: EMPTY_PLAN,
    };
    const card = { noteGuid: 'cloze-1', ord: 0, deckId: '20' };
    const config = { ...defaultConfig(), buryNew: true, buryReviews: true };
    expect(siblingsToBury(data, card, 'new', config)).toEqual([
      { noteGuid: 'cloze-1', ord: 1, deckId: '21' },
    ]);
    expect(siblingsToBury(data, card, 'new', defaultConfig())).toEqual([]);
  });
});
