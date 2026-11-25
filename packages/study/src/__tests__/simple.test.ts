// Tests the simple Anki: what is turned on, what the scheduler gets in simple and advanced mode, the load in minutes.

import { describe, expect, it } from 'vitest';
import type { CardSummary, DeckDetail } from '@qv/schema/anki';
import { deckCounts } from '../deckCounts';
import { defaultPreferences } from '../preferences';
import type { AnswerToday, StoredCard } from '@qv/schema/user';
import { countsOf } from '@qv/srs';
import { buildQueue, cardKey, configsFor, globalSettings } from '../scheduler';
import type { StudyData, TreeDeck } from '../scheduler';
import { blankRow } from '../session';
import { defaultConfig } from '@qv/srs';
import {
  DEFAULT_NEW_PER_DAY,
  EMPTY_PLAN,
  NO_LIMIT,
  breakdownText,
  estimateMinutes,
  extrasOff,
  loadText,
  minutesText,
  todayText,
  simpleConfigs,
  totalCards,
} from '../simple';
import type { StudyPlan } from '../simple';

const ROOT = '1';
const COURSE = '3';
const ASSESSMENT = '4';
const OTHER_ASSESSMENT = '9';
const L1 = '51';
const L1_EXTRAS = '61';
const L2 = '52';
const WEEK = '53';
const WEEK_DECK = '63';
const WEEK_EXTRAS = '73';
const OTHER_L = '91';

function decks(): TreeDeck[] {
  const out: TreeDeck[] = [];
  const add = (id: string, name: string, parentId: string | null, preset = 'Default') =>
    out.push({ id, name, label: name.split('::').at(-1)!, parentId, authorPreset: preset });
  add(ROOT, 'R', null);
  add('2', 'R::S', ROOT);
  add(COURSE, 'R::S::C', '2');
  add(ASSESSMENT, 'R::S::C::A', COURSE);
  add(L1, 'R::S::C::A::L1', ASSESSMENT);
  add(L1_EXTRAS, 'R::S::C::A::L1::Extras', L1, 'Extras');
  add(L2, 'R::S::C::A::L2', ASSESSMENT);
  add(WEEK, 'R::S::C::A::W', ASSESSMENT);
  add(WEEK_DECK, 'R::S::C::A::W::D', WEEK);
  add(WEEK_EXTRAS, 'R::S::C::A::W::D::Extras', WEEK_DECK, 'Extras');
  add(OTHER_ASSESSMENT, 'R::S::C::B', COURSE);
  add(OTHER_L, 'R::S::C::B::L', OTHER_ASSESSMENT);
  return out;
}

function cards(perDeck = 30): CardSummary[] {
  const out: CardSummary[] = [];
  for (const deckId of [L1, L1_EXTRAS, L2, WEEK_DECK, WEEK_EXTRAS, OTHER_L]) {
    for (let i = 0; i < perDeck; i++) {
      out.push({
        noteGuid: `${deckId}-${String(i).padStart(3, '0')}`,
        ord: 0,
        deckId,
        code: null,
        version: null,
        kind: 'basic',
        text: '',
      });
    }
  }
  return out;
}

const NOW = Date.parse('2026-10-31T15:00:00Z');

function review(c: CardSummary): StoredCard {
  return {
    ...blankRow(c),
    phase: 'review',
    interday: true,
    due: new Date(NOW - 36 * 3600_000).toISOString(),
    interval: 4,
    stability: 4,
    difficulty: 5,
    reps: 3,
    lastReview: new Date(NOW - 5 * 86_400_000).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
  };
}

function study(
  over: {
    plan?: Partial<StudyPlan>;
    rows?: StoredCard[];
    answers?: AnswerToday[];
    full?: boolean;
    list?: CardSummary[];
  } = {},
): StudyData {
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
    cards: over.list ?? cards(),
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
    rows: new Map((over.rows ?? []).map((r) => [cardKey(r), r])),
    answers: over.answers ?? [],
    prefs: { ...defaultPreferences('America/Santiago'), fullAnki: over.full ?? false },
    presets: [],
    settings: [],
    plan: { ...EMPTY_PLAN, ...over.plan },
  };
}

const counts = (data: StudyData, root: string) => countsOf(buildQueue(data, root, NOW));
const on = (...ids: string[]) => ids.map((deckId) => ({ deckId, active: true }));

describe('what the scheduler gets in simple mode', () => {
  it('what is not turned on gives no new cards', () => {
    expect(counts(study(), COURSE)).toEqual({ new: 0, learning: 0, review: 0 });
    const data = study({ plan: { activations: on(L2) } });
    expect(counts(data, COURSE).new).toBe(DEFAULT_NEW_PER_DAY);
    expect(counts(data, L1).new).toBe(0);
    expect(counts(data, L2).new).toBe(DEFAULT_NEW_PER_DAY);
  });

  it('the reviews of what was already seen keep coming, turned on or not', () => {
    const list = cards();
    const seen = list.filter((c) => c.deckId === L1).slice(0, 4);
    const data = study({
      list,
      rows: seen.map(review),
      plan: { activations: [{ deckId: L1, active: false }] },
    });
    expect(counts(data, COURSE)).toEqual({ new: 0, learning: 0, review: 4 });
  });

  it('the reviews of an Extras keep coming with the switch off, and its new cards do not', () => {
    const list = cards();
    const seen = list.filter((c) => c.deckId === L1_EXTRAS).slice(0, 3);
    const data = study({ list, rows: seen.map(review), plan: { activations: on(L1) } });
    expect(counts(data, L1_EXTRAS)).toEqual({ new: 0, learning: 0, review: 3 });
  });

  it('somebody who already studied a lecture has it on: its new cards go on', () => {
    const list = cards();
    const data = study({
      list,
      rows: [review(list.find((c) => c.deckId === L2)!)],
      plan: { answeredDecks: [L2] },
    });
    expect(counts(data, L2)).toEqual({ new: DEFAULT_NEW_PER_DAY, learning: 0, review: 1 });
    expect(counts(data, L1).new).toBe(0);
  });

  it('the new cards a day are of the whole assessment, wherever one studies from', () => {
    const plan = {
      activations: on(L1, L2, OTHER_L),
      assessments: [{ deckId: ASSESSMENT, includeExtras: false, newPerDay: 12 }],
    };
    const data = study({ plan });
    expect(counts(data, ASSESSMENT).new).toBe(12);
    expect(counts(data, L1).new).toBe(12);
    expect(counts(data, COURSE).new).toBe(12 + DEFAULT_NEW_PER_DAY);
    const after = study({
      plan,
      answers: Array.from({ length: 10 }, () => ({ deckId: L1, queueBefore: 'new' as const })),
    });
    expect(counts(after, L2).new).toBe(2);
    expect(counts(after, ASSESSMENT).new).toBe(2);
  });

  it('with the switch on, an Extras gives new cards with the limit of its deck (not its preset’s 0)', () => {
    const plan = {
      activations: on(L1),
      assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: 40 }],
    };
    const data = study({ plan });
    expect(configsFor(data).get(L1_EXTRAS)!.newPerDay).toBe(40);
    expect(counts(data, L1_EXTRAS).new).toBe(30);
    expect(counts(data, ASSESSMENT).new).toBe(40);
  });

  it('an assessment with 0 new cards a day gives none, and still its reviews', () => {
    const list = cards();
    const data = study({
      list,
      rows: [review(list.find((c) => c.deckId === L1)!)],
      plan: {
        activations: on(L1),
        assessments: [{ deckId: ASSESSMENT, includeExtras: false, newPerDay: 0 }],
      },
    });
    expect(counts(data, L1)).toEqual({ new: 0, learning: 0, review: 1 });
  });

  it('no limit of reviews: the preset says 5 and 25 come out', () => {
    const list = cards();
    const seen = list.filter((c) => c.deckId === L1).slice(0, 25);
    const data = study({ list, rows: seen.map(review), plan: { activations: on(L1) } });
    expect(configsFor(data).get(L1)!.reviewsPerDay).toBe(NO_LIMIT);
    expect(counts(data, L1).review).toBe(25);
  });

  it('the limits from above are on, and the decks above the assessments have no limit', () => {
    const data = study();
    expect(globalSettings(data.prefs).applyAllParentLimits).toBe(true);
    const configs = configsFor(data);
    for (const id of [ROOT, COURSE]) expect(configs.get(id)!.newPerDay).toBe(NO_LIMIT);
    expect(configs.get(ASSESSMENT)!.newPerDay).toBe(DEFAULT_NEW_PER_DAY);
  });

  it('nothing is suspended by itself and siblings are buried, whatever the preset says', () => {
    const config = configsFor(study()).get(L1)!;
    expect(config).toMatchObject({
      leechAction: 'tagOnly',
      buryNew: true,
      buryReviews: true,
      buryInterdayLearning: true,
    });
  });

  it('the deck list counts what will come out (siblings buried)', () => {
    const list: CardSummary[] = [0, 1, 2].map((ord) => ({
      noteGuid: 'cloze',
      ord,
      deckId: L1,
      code: null,
      version: null,
      kind: 'cloze',
      text: '',
    }));
    const data = study({ list, plan: { activations: on(L1) } });
    expect(deckCounts(data, NOW).get(L1)!.new).toBe(1);
    expect(countsOf(buildQueue(data, L1, NOW)).new).toBe(1);
  });
});

describe('«Modo avanzado»', () => {
  const list = cards();
  const rows = list
    .filter((c) => c.deckId === L1)
    .slice(0, 20)
    .map(review);
  const answers: AnswerToday[] = [{ deckId: L2, queueBefore: 'new' }];
  const plan: StudyPlan = {
    activations: [{ deckId: L2, active: true }],
    assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: 3 }],
    answeredDecks: [],
    medianAnswerMs: 1000,
  };
  const data = study({ full: true, list, rows, answers, plan });

  it('the presets count; the assessment’s number limits the assessment, and an included Extras', () => {
    const configs = configsFor(data);
    expect(configs.get(L1)).toMatchObject({ newPerDay: 7, reviewsPerDay: 5 });
    expect(configs.get(ASSESSMENT)).toMatchObject({ newPerDay: 3 });
    expect(configs.get(L1_EXTRAS)).toMatchObject({ newPerDay: 3, reviewsPerDay: 4 });
    expect(globalSettings(data.prefs).applyAllParentLimits).toBe(false);
  });

  it('what is not turned on gives no new cards', () => {
    expect(counts(data, L2).new).toBeGreaterThan(0);
    const off = study({ full: true, list, rows, answers, plan: { ...plan, activations: [] } });
    expect(counts(off, L2).new).toBe(0);
  });

  it('the counts are what the queue gives: siblings apart, unless a date needs them', () => {
    const cloze: CardSummary[] = [0, 1, 2].map((ord) => ({
      noteGuid: 'cloze',
      ord,
      deckId: L2,
      code: null,
      version: null,
      kind: 'cloze',
      text: '',
    }));
    const d = study({ full: true, list: cloze, plan });
    expect(deckCounts(d, NOW).get(L2)!.new).toBe(countsOf(buildQueue(d, L2, NOW)).new);
  });
});

describe('the load in minutes', () => {
  const load = (n: number, l: number, r: number) => ({ new: n, learning: l, review: r });

  it('a new card counts as two answers; without history, 15 s each', () => {
    expect(estimateMinutes(load(0, 0, 60), null)).toBe(15);
    expect(estimateMinutes(load(20, 0, 0), null)).toBe(10);
    expect(estimateMinutes(load(0, 4, 0), null)).toBe(1);
  });

  it('with the user’s history, their median', () => {
    expect(estimateMinutes(load(0, 0, 60), 6000)).toBe(6);
  });

  it('nothing is 0 minutes; something, at least 1', () => {
    expect(estimateMinutes(load(0, 0, 0), null)).toBe(0);
    expect(estimateMinutes(load(0, 0, 1), 1000)).toBe(1);
  });

  it('the text', () => {
    expect(loadText(load(0, 2, 60), null)).toBe('62 para hoy · ~16 min');
    expect(minutesText(45)).toBe('~45 min');
    expect(minutesText(60)).toBe('~1 h');
    expect(minutesText(80)).toBe('~1 h 20 min');
  });

  it('new ones and reviews apart, without a part that is 0', () => {
    expect(todayText({ new: 20, learning: 3, review: 12 }, null)).toBe(
      '20 nuevas · 15 repasos · ~14 min',
    );
    expect(todayText({ new: 1, learning: 0, review: 0 }, null)).toBe('1 nueva · ~1 min');
    expect(todayText({ new: 0, learning: 1, review: 0 }, null)).toBe('1 repaso · ~1 min');
    expect(todayText({ new: 1200, learning: 0, review: 0 }, 1000)).toBe('1.200 nuevas · ~40 min');
  });
});

describe('extrasOff', () => {
  const list = [
    { id: 'a', name: 'R::S::C::A' },
    { id: 'u', name: 'R::S::C::A::U' },
    { id: 'e', name: 'R::S::C::A::U::Extras' },
  ];
  const include = (includeExtras: boolean): StudyPlan => ({
    ...EMPTY_PLAN,
    assessments: [{ deckId: 'a', includeExtras, newPerDay: null }],
  });

  it('is true for an Extras deck of an assessment that does not include them, and false once it does', () => {
    expect(extrasOff(list, include(false), 'e')).toBe(true);
    expect(extrasOff(list, EMPTY_PLAN, 'e')).toBe(true);
    expect(extrasOff(list, include(true), 'e')).toBe(false);
  });

  it('is false for a deck that is not Extras and for one that does not exist', () => {
    expect(extrasOff(list, include(false), 'u')).toBe(false);
    expect(extrasOff(list, include(false), 'missing')).toBe(false);
  });
});

describe('simpleConfigs', () => {
  const names = [
    { id: 'r', name: 'R' },
    { id: 'a', name: 'R::S::C::A' },
    { id: 'u', name: 'R::S::C::A::U' },
    { id: 'e', name: 'R::S::C::A::U::Extras' },
    { id: 'o', name: 'R::S::C::B::U' },
  ];
  const presets = new Map(
    names.map((d) => [d.id, { ...defaultConfig(), newPerDay: 7, reviewsPerDay: 33 }]),
  );
  const plan: StudyPlan = {
    ...EMPTY_PLAN,
    assessments: [{ deckId: 'a', includeExtras: false, newPerDay: 12 }],
  };

  it('in simple mode the assessment’s number goes on each deck of it, the decks above have no limit and reviews have none', () => {
    const out = simpleConfigs(names, presets, plan);
    expect(out.get('u')).toMatchObject({ newPerDay: 12, reviewsPerDay: NO_LIMIT });
    expect(out.get('a')!.newPerDay).toBe(12);
    expect(out.get('r')!.newPerDay).toBe(NO_LIMIT);
    expect(out.get('o')!.newPerDay).toBe(DEFAULT_NEW_PER_DAY);
  });

  it('simple mode buries siblings and never suspends a leech, whatever the preset says', () => {
    const strict = new Map(
      names.map((d) => [d.id, { ...defaultConfig(), leechAction: 'suspend' as const }]),
    );
    expect(simpleConfigs(names, strict, plan).get('u')).toMatchObject({
      leechAction: 'tagOnly',
      buryNew: true,
      buryReviews: true,
      buryInterdayLearning: true,
    });
  });

  it('a pace worked out from a date beats the student’s number, and a deadline fills the day with siblings', () => {
    const out = simpleConfigs(names, presets, plan, new Map([['a', 31]]), new Set(['a']));
    expect(out.get('u')).toMatchObject({ newPerDay: 31, fillNewWithSiblings: true });
    expect(out.get('o')).toMatchObject({
      newPerDay: DEFAULT_NEW_PER_DAY,
      fillNewWithSiblings: false,
    });
  });

  describe('in the advanced mode', () => {
    const out = (paces = new Map<string, number>(), deadlines = new Set<string>()) =>
      simpleConfigs(names, presets, plan, paces, deadlines, true);

    it('keeps each preset’s own limits except for the assessment itself and its Extras', () => {
      const configs = out();
      expect(configs.get('a')!.newPerDay).toBe(12);
      expect(configs.get('e')!.newPerDay).toBe(12);
      expect(configs.get('u')).toMatchObject({ newPerDay: 7, reviewsPerDay: 33, buryNew: false });
      expect(configs.get('r')!.newPerDay).toBe(7);
    });

    it('every deck of an assessment with a worked-out pace follows it, and a deadline fills with siblings', () => {
      const configs = out(new Map([['a', 40]]), new Set(['a']));
      expect(configs.get('u')).toMatchObject({ newPerDay: 40, fillNewWithSiblings: true });
      expect(configs.get('o')).toMatchObject({ newPerDay: 7, fillNewWithSiblings: false });
    });
  });

  it('a deck whose assessment is missing from the list gets the default number, or its own preset’s in the advanced mode, not a crash', () => {
    const lone = [{ id: 'u', name: 'R::S::C::A::U' }];
    expect(
      simpleConfigs(lone, new Map([['u', defaultConfig()]]), EMPTY_PLAN).get('u')!.newPerDay,
    ).toBe(DEFAULT_NEW_PER_DAY);
    expect(
      simpleConfigs(
        lone,
        new Map([['u', { ...defaultConfig(), newPerDay: 3 }]]),
        EMPTY_PLAN,
        undefined,
        undefined,
        true,
      ).get('u')!.newPerDay,
    ).toBe(3);
  });
});

describe('the counts as text', () => {
  it('adds the three kinds of card', () => {
    expect(totalCards({ new: 3, learning: 1, review: 2 })).toBe(6);
  });

  it('spells them out one by one', () => {
    expect(breakdownText({ new: 3, learning: 1, review: 2 })).toBe(
      'Nuevas: 3 · Aprendiendo: 1 · A repasar: 2',
    );
  });

  it('hours and minutes read as «~1 h 5 min», and a full hour has no minutes', () => {
    expect(minutesText(59)).toBe('~59 min');
    expect(minutesText(65)).toBe('~1 h 5 min');
    expect(minutesText(120)).toBe('~2 h');
  });
});

describe('extrasOff with an assessment that is not in the list', () => {
  it('counts the Extras as off, since nothing includes them', () => {
    const lone = [{ id: 'e', name: 'R::S::C::A::U::Extras' }];
    const plan: StudyPlan = {
      ...EMPTY_PLAN,
      assessments: [{ deckId: 'a', includeExtras: true, newPerDay: null }],
    };
    expect(extrasOff(lone, plan, 'e')).toBe(true);
  });
});

describe('which decks are Extras', () => {
  const named = [
    { id: '1', name: 'R::S::C' },
    { id: '2', name: 'R::S::C::Extras' },
    { id: '3', name: 'R::S::C::A' },
    { id: '4', name: 'R::S::C::A::Extras' },
  ];

  it('only a deck called Extras from the level of the weeks or lectures down: an assessment with that name is not one', () => {
    expect(extrasOff(named, EMPTY_PLAN, '2')).toBe(false);
    expect(extrasOff(named, EMPTY_PLAN, '4')).toBe(true);
  });
});
