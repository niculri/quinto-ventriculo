import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CardSummary, DeckDetail } from '@qv/schema';
import { deckCounts } from './DeckCounts';
import { defaultPreferences, localStudyRepository } from './repository';
import type { AnswerToday, CardRef, StoredCard, StudyRepository } from './repository';
import { cardKey } from './scheduler';
import type { StudyData, TreeDeck } from './scheduler';
import { StudySession, blankRow } from './session';
import { EMPTY_PLAN, extrasOff } from './simple';
import type { StudyPlan } from './simple';

const NOW = Date.parse('2026-10-31T15:00:00Z');
const DAY = 86_400_000;

// The clock stands still: a learning card comes back within the learn-ahead limit, as a session of a few minutes.
beforeAll(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});
afterAll(() => {
  vi.useRealTimers();
});

const COURSE = '3';
const ASSESSMENT = '4';
/** Lectures of the assessment, a week with two decks and their Extras, and a second assessment. */
const L1 = '51';
const L1_EXTRAS = '61';
const L2 = '52';
const WEEK = '53';
const WEEK_D1 = '63';
const WEEK_D1_EXTRAS = '73';
const WEEK_D2 = '64';
const OTHER = '9';
const OTHER_L = '91';

function decks(): TreeDeck[] {
  const out: TreeDeck[] = [];
  const add = (id: string, name: string, parentId: string | null, preset = 'Default') =>
    out.push({ id, name, label: name.split('::').at(-1)!, parentId, authorPreset: preset });
  add('1', 'R', null);
  add('2', 'R::S', '1');
  add(COURSE, 'R::S::C', '2');
  add(ASSESSMENT, 'R::S::C::A', COURSE);
  add(L1, 'R::S::C::A::L1', ASSESSMENT);
  add(L1_EXTRAS, 'R::S::C::A::L1::Extras', L1, 'Extras');
  add(L2, 'R::S::C::A::L2', ASSESSMENT);
  add(WEEK, 'R::S::C::A::W', ASSESSMENT);
  add(WEEK_D1, 'R::S::C::A::W::D1', WEEK);
  add(WEEK_D1_EXTRAS, 'R::S::C::A::W::D1::Extras', WEEK_D1, 'Extras');
  add(WEEK_D2, 'R::S::C::A::W::D2', WEEK);
  add(OTHER, 'R::S::C::B', COURSE);
  add(OTHER_L, 'R::S::C::B::L', OTHER);
  return out;
}

const card = (noteGuid: string, ord: number, deckId: string): CardSummary => ({
  noteGuid,
  ord,
  deckId,
  code: null,
  version: null,
  kind: 'basic',
  text: '',
});

/** In each deck with cards, 12 notes; every third one with a sibling, in its Extras if the deck has one. */
function cards(): CardSummary[] {
  const extrasOf: Record<string, string> = { [L1]: L1_EXTRAS, [WEEK_D1]: WEEK_D1_EXTRAS };
  const out: CardSummary[] = [];
  for (const deckId of [L1, L1_EXTRAS, L2, WEEK_D1, WEEK_D1_EXTRAS, WEEK_D2, OTHER_L]) {
    for (let i = 0; i < 12; i++) {
      const guid = `${deckId}-${String(i).padStart(2, '0')}`;
      out.push(card(guid, 0, deckId));
      if (i % 3 === 0) out.push(card(guid, 1, extrasOf[deckId] ?? deckId));
    }
  }
  return out;
}

const review = (c: CardRef, daysAgoDue = 1): StoredCard => ({
  ...blankRow(c),
  phase: 'review',
  interday: true,
  due: new Date(NOW - daysAgoDue * DAY - 3 * 3_600_000).toISOString(),
  interval: 4,
  stability: 4,
  difficulty: 5,
  reps: 3,
  lastReview: new Date(NOW - 5 * DAY).toISOString(),
  updatedAt: new Date(NOW - DAY).toISOString(),
});

const learning = (c: CardRef, minutes: number): StoredCard => ({
  ...blankRow(c),
  phase: 'learning',
  remainingSteps: 1,
  due: new Date(NOW + minutes * 60_000).toISOString(),
  stability: 2,
  difficulty: 5,
  reps: 1,
  lastReview: new Date(NOW - 60_000).toISOString(),
  updatedAt: new Date(NOW - 60_000).toISOString(),
});

function study(rows: StoredCard[], plan: Partial<StudyPlan>, answers: AnswerToday[] = []) {
  const list = decks();
  const deck: DeckDetail = {
    id: COURSE,
    name: 'C',
    fullName: 'R::S::C',
    description: '',
    courseId: 'c',
    assessmentId: null,
    preset: 'Default',
    noteCount: 0,
    cardCount: 0,
    subdecks: list
      .filter((d) => d.name.startsWith('R::S::C::'))
      .map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        preset: d.authorPreset,
        cardCount: 0,
      })),
    cards: cards(),
    presets: [],
  };
  return {
    deck,
    decks: list,
    authorPresets: [
      {
        name: 'Default',
        config: { new: { perDay: 7, bury: true }, rev: { perDay: 5, bury: false } },
      },
      { name: 'Extras', config: { new: { perDay: 0 }, rev: { perDay: 4 } } },
    ],
    rows: new Map(rows.map((r) => [cardKey(r), r])),
    answers,
    prefs: { ...defaultPreferences('America/Santiago'), fullAnki: false },
    presets: [],
    settings: [],
    plan: { ...EMPTY_PLAN, ...plan },
  } satisfies StudyData;
}

/** Saves nothing: what is under test is what the session does with the queue. */
function noSaving(): StudyRepository {
  return {
    ...localStudyRepository(null),
    recordReview: async () => ({ updatedAt: 'saved' }),
    bury: async () => {},
    suspend: async () => {},
    cards: async () => [],
  };
}

/** The subset of the deck a session opens with, as the API gives it for that deck. */
function withRoot(data: StudyData, root: string): StudyData {
  const name = data.decks.find((d) => d.id === root)!.name;
  const ids = new Set(
    data.decks.filter((d) => d.name === name || d.name.startsWith(`${name}::`)).map((d) => d.id),
  );
  return {
    ...data,
    deck: { ...data.deck, id: root, cards: data.deck.cards.filter((c) => ids.has(c.deckId)) },
  };
}

/** Everything a session shows answering «Bien» until nothing is left: the cards, once each, by how they came. */
function walk(data: StudyData, root: string) {
  const session = new StudySession(withRoot(data, root), root, noSaving());
  session.showNext();
  const seen = new Map<string, 'new' | 'learning' | 'review'>();
  for (let i = 0; i < 2000 && session.shown; i++) {
    const { entry } = session.shown;
    if (!seen.has(cardKey(entry))) seen.set(cardKey(entry), entry.kind);
    session.reveal();
    session.answer(3);
  }
  expect(session.shown).toBeNull();
  const kinds = [...seen.values()];
  return {
    new: kinds.filter((k) => k === 'new').length,
    learning: kinds.filter((k) => k === 'learning').length,
    review: kinds.filter((k) => k === 'review').length,
  };
}

const on = (...ids: string[]) => ids.map((deckId) => ({ deckId, active: true }));

const SCENARIOS: [string, () => StudyData][] = [
  ['somebody who just arrived', () => study([], {})],
  ['one lecture on', () => study([], { activations: on(L2) })],
  ['a week on, without its Extras', () => study([], { activations: on(WEEK) })],
  [
    'with Extras and a number of its own, over the limit of a lecture',
    () =>
      study([], {
        activations: on(L1, WEEK, OTHER_L),
        assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: 15 }],
      }),
  ],
  [
    'reviews and learning cards of a lecture turned off, of an Extras turned off, and of what is on',
    () => {
      const list = cards();
      const of = (deckId: string, n: number) => list.filter((c) => c.deckId === deckId).slice(0, n);
      return study(
        [
          ...of(L1, 5).map((c) => review(c)),
          ...of(L1_EXTRAS, 3).map((c) => review(c, 2)),
          ...of(L2, 2).map((c) => learning(c, 5)),
          ...of(WEEK_D1, 2).map((c) => review(c)),
          ...of(OTHER_L, 2).map((c) => learning(c, 5)),
        ],
        {
          activations: [
            { deckId: L1, active: false },
            { deckId: L2, active: false },
            { deckId: WEEK, active: true },
          ],
          answeredDecks: [L1, L1_EXTRAS, L2, WEEK_D1, OTHER_L],
        },
      );
    },
  ],
  [
    'with part of the day’s new cards already studied',
    () =>
      study(
        [],
        { activations: on(L1, L2) },
        Array.from({ length: 12 }, () => ({ deckId: L1, queueBefore: 'new' as const })),
      ),
  ],
];

describe('«N para hoy» is what comes out, from every level', () => {
  it.each(SCENARIOS)('%s', (_name, build) => {
    const data = build();
    const list = deckCounts(data);
    for (const id of [
      COURSE,
      ASSESSMENT,
      L1,
      L1_EXTRAS,
      L2,
      WEEK,
      WEEK_D1,
      WEEK_D2,
      OTHER,
      OTHER_L,
    ]) {
      const name = data.decks.find((d) => d.id === id)!.name;
      expect({ name, ...walk(data, id) }).toEqual({ name, ...list.get(id)! });
    }
  });

  it('the Extras of what is on stays out of the day until it is included, with its reviews always in', () => {
    const list = cards();
    const seen = list.filter((c) => c.deckId === L1_EXTRAS).slice(0, 3);
    const off = study(
      seen.map((c) => review(c)),
      { activations: on(L1) },
    );
    expect(walk(off, L1_EXTRAS)).toEqual({ new: 0, learning: 0, review: 3 });
    const included = study(
      seen.map((c) => review(c)),
      {
        activations: on(L1),
        assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }],
      },
    );
    expect(walk(included, L1_EXTRAS).new).toBeGreaterThan(0);
  });
});

describe('going back and forth in a session', () => {
  const session = (data: StudyData, root: string) => {
    const s = new StudySession(withRoot(data, root), root, {
      ...noSaving(),
      undo: async () => {
        throw new Error('not in this test');
      },
    });
    s.showNext();
    return s;
  };

  it('undoing an answer gives back the card, the count and the sibling it had buried', () => {
    const data = study([], { activations: on(L2) });
    const s = session(data, L2);
    const before = s.counts();
    const first = s.shown!.entry;
    expect(first).toMatchObject({ deckId: L2, ord: 0, kind: 'new' });
    s.reveal();
    s.answer(3);
    // Its sibling (ord 1 of the same note) went with it: buried until tomorrow.
    const sibling = { noteGuid: first.noteGuid, ord: 1 };
    expect(s.row(sibling)?.buriedUntil).toBeTruthy();
    expect(s.counts()).not.toEqual(before);
    s.undo();
    expect(s.shown!.entry).toMatchObject({ noteGuid: first.noteGuid, ord: 0 });
    expect(s.counts()).toEqual(before);
    expect(s.row(first)).toBeUndefined();
    expect(s.row(sibling)).toBeUndefined();
  });

  it('a lecture turned off with cards in learning: they keep coming, and no new ones', () => {
    const list = cards().filter((c) => c.deckId === L2);
    const data = study(
      list.slice(0, 2).map((c) => learning(c, 5)),
      { activations: [{ deckId: L2, active: false }], answeredDecks: [L2] },
    );
    expect(walk(data, L2)).toEqual({ new: 0, learning: 2, review: 0 });
    const s = session(data, L2);
    while (s.shown) {
      s.reveal();
      s.answer(3);
    }
    // Then it says that nothing is on, and that the new ones are there to turn on.
    expect(s.congrats()).toMatchObject({ nothingActive: true });
    expect(s.congrats().inactiveNew).toBeGreaterThan(0);
  });

  it('with nothing on and a learning card later today, the end screen knows', () => {
    const list = cards().filter((c) => c.deckId === L2);
    const data = study([learning(list[0]!, 60)], {
      activations: [{ deckId: L2, active: false }],
      answeredDecks: [L2],
    });
    const s = session(data, L2);
    expect(s.shown).toBeNull();
    expect(s.congrats().nothingActive).toBe(true);
    expect(s.congrats().learnMessage).toMatch(/próxima|prox/i);
  });

  it('skipping a card does not use up the day: another new one takes its place', () => {
    const data = study([], {
      activations: on(L2),
      assessments: [{ deckId: ASSESSMENT, includeExtras: false, newPerDay: 3 }],
    });
    const s = session(data, L2);
    expect(s.counts().new).toBe(3);
    const first = s.shown!.entry;
    s.hide('bury_note');
    expect(s.shown!.entry.noteGuid).not.toBe(first.noteGuid);
    expect(s.counts().new).toBe(3);
  });
});

describe('a card that costs a lot (a leech)', () => {
  it('is only noted down in simple mode, whatever the preset says; in the full mode the preset decides', async () => {
    const list = cards().filter((c) => c.deckId === L2);
    const row = { ...review(list[0]!), lapses: 7 };
    const same = (c: CardRef & { ord: number }) => c.noteGuid === row.noteGuid && c.ord === row.ord;
    const answerIt = async (fullAnki: boolean) => {
      const saved: { suspended: boolean; leech: boolean }[] = [];
      const base = withRoot(study([row], { activations: on(L2), answeredDecks: [L2] }), L2);
      const data = {
        ...base,
        // Only that card, so that it comes first in both modes.
        deck: { ...base.deck, cards: base.deck.cards.filter(same) },
        // The preset says to suspend it.
        authorPresets: [
          { name: 'Default', config: { lapse: { leechAction: 0, leechFails: 8 } } },
          { name: 'Extras', config: {} },
        ],
        prefs: { ...base.prefs, fullAnki },
      };
      const s = new StudySession(data, L2, {
        ...noSaving(),
        recordReview: async (input) => {
          saved.push(input.state);
          return { updatedAt: 'saved' };
        },
      });
      s.showNext();
      expect(s.shown!.entry).toMatchObject({ noteGuid: row.noteGuid, kind: 'review' });
      s.reveal();
      s.answer(1);
      await s.saved();
      return { state: saved[0]!, toast: s.toast };
    };
    expect(await answerIt(false)).toMatchObject({
      state: { leech: true, suspended: false },
      toast: null,
    });
    const full = await answerIt(true);
    expect(full.state).toMatchObject({ leech: true, suspended: true });
    expect(full.toast).toMatch(/sanguijuela/);
  });
});

describe('the Extras that are off', () => {
  const plan = (includeExtras: boolean): StudyPlan => ({
    ...EMPTY_PLAN,
    assessments: [{ deckId: ASSESSMENT, includeExtras, newPerDay: null }],
  });

  it('an Extras deck (at any depth) with its assessment’s switch off; nothing else', () => {
    expect(extrasOff(decks(), EMPTY_PLAN, L1_EXTRAS)).toBe(true);
    expect(extrasOff(decks(), EMPTY_PLAN, WEEK_D1_EXTRAS)).toBe(true);
    expect(extrasOff(decks(), plan(true), L1_EXTRAS)).toBe(false);
    expect(extrasOff(decks(), plan(false), L1_EXTRAS)).toBe(true);
    expect(extrasOff(decks(), EMPTY_PLAN, L1)).toBe(false);
    expect(extrasOff(decks(), EMPTY_PLAN, ASSESSMENT)).toBe(false);
  });

  it('studying it, the end screen says so, not that the lecture is off', () => {
    const s = new StudySession(
      withRoot(study([], { activations: on(L1) }), L1_EXTRAS),
      L1_EXTRAS,
      noSaving(),
    );
    s.showNext();
    expect(s.shown).toBeNull();
    expect(s.congrats().extrasOff).toBe(true);
  });

  it('in «Modo avanzado» too', () => {
    const data = study([], {});
    const s = new StudySession(
      { ...withRoot(data, L1_EXTRAS), prefs: { ...data.prefs, fullAnki: true } },
      L1_EXTRAS,
      noSaving(),
    );
    s.showNext();
    expect(s.congrats().extrasOff).toBe(true);
  });
});
