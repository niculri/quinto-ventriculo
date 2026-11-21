// Study data for the session tests: a small tree of decks with cards in every state (new, learning, interday
// learning, review, suspended, buried, flagged, about to be a leech), siblings of one note, and presets that bury.
import { dayStartsAt, schedTiming } from '@qv/srs';
import type { CardSummary, DeckDetail } from '@qv/schema/anki';
import type { AnswerToday, StoredCard } from '@qv/schema/user';
import { cardKey } from '../../scheduler';
import type { StudyData, TreeDeck } from '../../scheduler';
import { defaultPreferences } from '../../preferences';
import { blankRow } from '../../session';
import { EMPTY_PLAN } from '../../simple';
import type { StudyPlan } from '../../simple';

const ZONE = 'America/Santiago';
const COURSE = '3';
export const ASSESSMENT = '4';
export const L1 = '51';
export const L2 = '52';
const L3 = '53';
const SUB = '54';
const OTHER = '91';

/** 2026-11-18 12:00 in Santiago. */
const NOON = Date.parse('2026-11-18T15:00:00Z');
/** 10 minutes before the day turns over (4:00) in Santiago. */
const BEFORE_ROLLOVER = Date.parse('2026-11-19T06:50:00Z');

export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tree(): TreeDeck[] {
  const out: TreeDeck[] = [];
  const add = (id: string, name: string, parentId: string | null, preset = 'Default') =>
    out.push({ id, name, label: name.split('::').at(-1)!, parentId, authorPreset: preset });
  add('1', 'R', null);
  add('2', 'R::S', '1');
  add(COURSE, 'R::S::C', '2');
  add(ASSESSMENT, 'R::S::C::A', COURSE);
  add(L1, 'R::S::C::A::L1', ASSESSMENT);
  add(L2, 'R::S::C::A::L2', ASSESSMENT, 'Strict');
  add(L3, 'R::S::C::A::L3', ASSESSMENT);
  add(SUB, 'R::S::C::A::L1::Sub', L1, 'Strict');
  add('90', 'R::S::C::B', COURSE);
  add(OTHER, 'R::S::C::B::L', '90');
  return out;
}

const PRESETS = [
  {
    name: 'Default',
    config: {
      new: { perDay: 10, bury: true, delays: [1, 10] },
      rev: { perDay: 40, bury: true },
      lapse: { delays: [10], leechFails: 8, leechAction: 1 },
      maxTaken: 20,
    },
  },
  {
    // Day-long steps, leeches suspended and no burying: cards come back the next day.
    name: 'Strict',
    config: {
      new: { perDay: 6, bury: false, delays: [1, 10, 1440] },
      rev: { perDay: 15, bury: false },
      lapse: { delays: [10, 1440], leechFails: 8, leechAction: 0 },
      buryInterdayLearning: true,
    },
  },
];

interface Options {
  full: boolean;
  start: number;
  /** A student who has already answered today and has the day's figures. */
  withAnswers?: boolean;
  learnAheadMinutes?: number;
  /** Most of the reviews one failure away from being a leech. */
  leechy?: boolean;
  seed?: number;
  notesPerDeck?: number;
}

export interface Scenario {
  name: string;
  rootId: string;
  start: number;
  data: () => StudyData;
}

const subtreeIds = (decks: TreeDeck[], id: string) => {
  const root = decks.find((d) => d.id === id)!;
  return decks.filter((d) => d.name === root.name || d.name.startsWith(`${root.name}::`));
};

function cardsOfNote(deckId: string, n: number, rnd: () => number): CardSummary[] {
  const kind = rnd() < 0.4 ? 'cloze' : 'basic';
  const count = kind === 'cloze' ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
  const noteGuid = `n${deckId}-${String(n).padStart(2, '0')}`;
  return Array.from({ length: count }, (_, ord) => {
    const version = rnd() < 0.5 ? 1 + Math.floor(rnd() * 3) : null;
    return { noteGuid, ord, deckId, code: null, version, kind, text: '' };
  });
}

function cardsAndRows(o: Options, dayStart: (offset: number) => string) {
  const rnd = random(o.seed ?? 7);
  const cards: CardSummary[] = [];
  const rows: StoredCard[] = [];
  for (const deckId of [L1, L2, L3, SUB, OTHER]) {
    for (let n = 0; n < (o.notesPerDeck ?? 7); n++) {
      for (const card of cardsOfNote(deckId, n, rnd)) {
        cards.push(card);
        const row = stateOf(card, rnd, o.start, dayStart, o.leechy ? 0.7 : 0.15);
        if (row) rows.push(row);
      }
    }
  }
  return { cards, rows };
}

function deckDetail(decks: TreeDeck[], rootId: string, all: CardSummary[]): DeckDetail {
  const inRoot = subtreeIds(decks, rootId);
  const ids = new Set(inRoot.map((d) => d.id));
  const root = decks.find((d) => d.id === rootId)!;
  const cards = all.filter((c) => ids.has(c.deckId));
  return {
    id: rootId,
    name: root.label,
    fullName: root.name,
    description: '',
    courseId: 'c',
    assessmentId: null,
    preset: root.authorPreset,
    noteCount: 0,
    cardCount: cards.length,
    subdecks: inRoot
      .filter((d) => d.id !== rootId)
      .map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        preset: d.authorPreset,
        cardCount: 0,
      })),
    cards,
    presets: [],
  };
}

function build(o: Options, rootId: string): StudyData {
  const decks = tree();
  const timing = schedTiming(o.start / 1000, ZONE, 4);
  const dayStart = (offset: number) =>
    new Date(dayStartsAt(timing.today + offset, ZONE, 4) * 1000).toISOString();
  const { cards, rows } = cardsAndRows(o, dayStart);
  const answers: AnswerToday[] = o.withAnswers
    ? [
        { deckId: L1, queueBefore: 'new' },
        { deckId: L1, queueBefore: 'new' },
        { deckId: L2, queueBefore: 'review' },
      ]
    : [];
  const plan: StudyPlan = {
    ...EMPTY_PLAN,
    activations: [
      { deckId: L1, active: true },
      { deckId: L2, active: true },
    ],
    answeredDecks: o.full ? [] : [L3],
  };
  const progress = o.withAnswers
    ? {
        progress: [
          { deckId: L1, seen: 4, newSuspended: 0, overdue: 0, newToday: 2, newYesterday: 3 },
          { deckId: L2, seen: 2, newSuspended: 0, overdue: 0, newToday: 0, newYesterday: 1 },
        ],
      }
    : {};
  return {
    deck: deckDetail(decks, rootId, cards),
    decks,
    authorPresets: PRESETS,
    rows: new Map(rows.map((r) => [cardKey(r), r])),
    answers,
    prefs: {
      ...defaultPreferences(ZONE),
      fullAnki: o.full,
      fourButtons: o.full,
      learnAheadMinutes: o.learnAheadMinutes ?? 20,
    },
    presets: [],
    settings: [],
    plan,
    ...progress,
  };
}

// Half of the cards have never been answered; the rest are spread over every state a stored card can be in.
function stateOf(
  card: CardSummary,
  rnd: () => number,
  now: number,
  dayStart: (offset: number) => string,
  nearLeech: number,
): StoredCard | null {
  const roll = rnd();
  if (roll < 0.45) return null;
  const base = {
    ...blankRow(card),
    updatedAt: `m:${card.noteGuid}:${card.ord}`,
    flag: rnd() < 0.1 ? 1 + Math.floor(rnd() * 7) : 0,
  };
  const minutes = (m: number) => new Date(now + m * 60_000).toISOString();
  if (roll < 0.6) {
    return {
      ...base,
      phase: 'learning',
      interday: false,
      remainingSteps: rnd() < 0.5 ? 2002 : 1001,
      due: minutes(Math.floor(rnd() * 50) - 15),
      reps: 1,
      lastReview: minutes(-20),
    };
  }
  if (roll < 0.68) {
    return {
      ...base,
      phase: 'relearning',
      interday: true,
      remainingSteps: 1001,
      due: dayStart(rnd() < 0.5 ? 0 : 1),
      interval: 1,
      stability: 3,
      difficulty: 6,
      reps: 5,
      lapses: 2,
      lastReview: dayStart(-1),
    };
  }
  if (roll < 0.74)
    return {
      ...base,
      suspended: true,
      phase: 'review',
      interday: true,
      due: dayStart(1),
      interval: 5,
      reps: 3,
    };
  if (roll < 0.8) return { ...base, buriedUntil: dayStart(1) };
  const lapses = rnd() < nearLeech ? 7 : Math.floor(rnd() * 3);
  return {
    ...base,
    phase: 'review',
    interday: true,
    remainingSteps: 0,
    due: dayStart(Math.floor(rnd() * 5) - 3),
    interval: 3 + Math.floor(rnd() * 20),
    stability: 4 + rnd() * 30,
    difficulty: 3 + rnd() * 6,
    reps: 4 + lapses,
    lapses,
    lastReview: dayStart(-3 - Math.floor(rnd() * 10)),
  };
}

export const SCENARIOS: Scenario[] = [
  {
    name: 'advanced mode, the whole course',
    rootId: COURSE,
    start: NOON,
    data: () => build({ full: true, start: NOON }, COURSE),
  },
  {
    name: 'simple mode, the whole course',
    rootId: COURSE,
    start: NOON,
    data: () => build({ full: false, start: NOON, seed: 11 }, COURSE),
  },
  {
    name: 'advanced mode, one unit with a subdeck, no learn-ahead',
    rootId: L1,
    start: NOON,
    data: () => build({ full: true, start: NOON, seed: 5, learnAheadMinutes: 0 }, L1),
  },
  {
    name: 'ten minutes before the day turns over, with the day’s answers',
    rootId: COURSE,
    start: BEFORE_ROLLOVER,
    data: () => build({ full: true, start: BEFORE_ROLLOVER, withAnswers: true, seed: 3 }, COURSE),
  },
  {
    name: 'simple mode before the rollover, with the day’s answers',
    rootId: ASSESSMENT,
    start: BEFORE_ROLLOVER,
    data: () =>
      build({ full: false, start: BEFORE_ROLLOVER, withAnswers: true, seed: 21 }, ASSESSMENT),
  },
  {
    name: 'few cards, so the queue empties and fills again',
    rootId: L2,
    start: NOON,
    data: () => build({ full: true, start: NOON, seed: 9, notesPerDeck: 2 }, L2),
  },
  {
    name: 'advanced mode, reviews one failure from being leeches (suspended in the strict unit)',
    rootId: COURSE,
    start: NOON,
    data: () => build({ full: true, start: NOON, seed: 17, leechy: true }, COURSE),
  },
  {
    name: 'simple mode, reviews one failure from being leeches',
    rootId: COURSE,
    start: NOON,
    data: () => build({ full: false, start: NOON, seed: 19, leechy: true }, COURSE),
  },
];
