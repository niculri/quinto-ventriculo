import { describe, expect, it } from 'vitest';
import type { CardSummary, DeckDetail } from '@qv/schema';
import { deckCounts } from './DeckCounts';
import { defaultPreferences } from './repository';
import type { AnswerToday, StoredCard } from './repository';
import { buildQueue, cardKey, configsFor, globalSettings } from './scheduler';
import type { StudyData, TreeDeck } from './scheduler';
import { blankRow } from './session';
import {
  DEFAULT_NEW_PER_DAY,
  EMPTY_PLAN,
  NO_LIMIT,
  activeUnits,
  decksGivingNew,
  estimateMinutes,
  loadText,
  minutesText,
} from './simple';
import type { StudyPlan } from './simple';

const ROOT = '1';
const COURSE = '3';
const ASSESSMENT = '4';
const OTHER_ASSESSMENT = '9';
/** Two lectures with their Extras, a week with a deck inside, and another assessment. */
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

/** `perDeck` new cards in each deck with cards. */
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

const counts = (data: StudyData, root: string) => buildQueue(data, root, NOW).counts();
const on = (...ids: string[]) => ids.map((deckId) => ({ deckId, active: true }));

describe('what is turned on', () => {
  it('nothing, for somebody who just arrived', () => {
    expect(activeUnits(decks(), EMPTY_PLAN).size).toBe(0);
  });

  it('by hand, or because a card of it was answered, also in a deck below it', () => {
    const plan = { ...EMPTY_PLAN, activations: on(L1), answeredDecks: [WEEK_EXTRAS] };
    expect([...activeUnits(decks(), plan)].sort()).toEqual([L1, WEEK].sort());
  });

  it('turned off by hand stays off, even if it was studied', () => {
    const plan: StudyPlan = {
      ...EMPTY_PLAN,
      activations: [{ deckId: L1, active: false }],
      answeredDecks: [L1],
    };
    expect(activeUnits(decks(), plan).size).toBe(0);
  });

  it('an assessment or a course are not switches: only the level under the assessment', () => {
    const plan = { ...EMPTY_PLAN, activations: on(ASSESSMENT, COURSE) };
    expect(activeUnits(decks(), plan).size).toBe(0);
  });

  it('the Extras of what is on give new cards only if its assessment includes them', () => {
    const plan = { ...EMPTY_PLAN, activations: on(L1, OTHER_L) };
    const off = decksGivingNew(decks(), plan);
    expect(off.has(L1)).toBe(true);
    expect(off.has(L1_EXTRAS)).toBe(false);
    const with_ = decksGivingNew(decks(), {
      ...plan,
      assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }],
    });
    expect(with_.has(L1_EXTRAS)).toBe(true);
    // Not those of a lecture turned off, even with the switch on.
    expect(with_.has(WEEK_EXTRAS)).toBe(false);
  });
});

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
    // Each assessment on its own: from the course they add up (the other one with the default).
    expect(counts(data, COURSE).new).toBe(12 + DEFAULT_NEW_PER_DAY);
    // What was studied today in one lecture counts for the other one.
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
    // L1 and its Extras together, up to the assessment's number.
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
    expect(buildQueue(data, L1, NOW).counts().new).toBe(1);
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
    expect(deckCounts(d, NOW).get(L2)!.new).toBe(buildQueue(d, L2, NOW).counts().new);
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
});
