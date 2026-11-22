// A small study tree for the tests of the study domain: one course with an assessment of two units and an Extras deck
// under the first, each with a few cards. Everything is invented.
import type { CardSummary, DeckDetail } from '@qv/schema/anki';
import type { StoredCard } from '@qv/schema/user';
import { defaultPreferences } from '../preferences';
import { cardKey } from '../scheduler';
import type { StudyData, TreeDeck } from '../scheduler';
import { blankRow } from '../session';
import { EMPTY_PLAN } from '../simple';

export const ZONE = 'America/Santiago';
/** 2026-11-18 12:00 in Santiago, the day after the rollover at 4:00. */
export const NOON = Date.parse('2026-11-18T15:00:00Z');
export const DAY_MS = 86_400_000;

export const ROOT = '1';
export const COURSE = '3';
export const ASSESSMENT = '4';
export const UNIT1 = '5';
export const UNIT2 = '6';
export const EXTRAS = '7';

const NAMES: [string, string, string | null][] = [
  [ROOT, 'R', null],
  ['2', 'R::S', ROOT],
  [COURSE, 'R::S::C', '2'],
  [ASSESSMENT, 'R::S::C::A', COURSE],
  [UNIT1, 'R::S::C::A::U1', ASSESSMENT],
  [UNIT2, 'R::S::C::A::U2', ASSESSMENT],
  [EXTRAS, 'R::S::C::A::U1::Extras', UNIT1],
];

export const treeDecks = (ownCards: Record<string, number> = {}): TreeDeck[] =>
  NAMES.map(([id, name, parentId]) => ({
    id,
    name,
    label: name.split('::').at(-1)!,
    parentId,
    authorPreset: 'Default',
    ownCards: ownCards[id] ?? 0,
  }));

export const summary = (noteGuid: string, ord: number, deckId: string): CardSummary => ({
  noteGuid,
  ord,
  deckId,
  code: null,
  version: null,
  kind: 'basic',
  text: '',
});

export const CARDS: CardSummary[] = [
  summary('n1', 0, UNIT1),
  summary('n1', 1, UNIT1),
  summary('n2', 0, UNIT1),
  summary('n3', 0, UNIT2),
  summary('n4', 0, EXTRAS),
];

function deckDetail(rootId: string, cards: CardSummary[], decks = treeDecks()): DeckDetail {
  const root = decks.find((d) => d.id === rootId)!;
  const inside = decks.filter((d) => d.name === root.name || d.name.startsWith(`${root.name}::`));
  const ids = new Set(inside.map((d) => d.id));
  const own = cards.filter((c) => ids.has(c.deckId));
  return {
    id: rootId,
    name: root.label,
    fullName: root.name,
    description: '',
    courseId: null,
    assessmentId: null,
    preset: 'Default',
    noteCount: 0,
    cardCount: own.length,
    subdecks: inside
      .filter((d) => d.id !== rootId)
      .map((d) => ({
        id: d.id,
        name: d.label,
        parentId: d.parentId,
        preset: d.authorPreset,
        cardCount: 0,
      })),
    cards: own,
    presets: [],
  };
}

export const rowFor = (
  c: { noteGuid: string; ord: number; deckId: string },
  over: Partial<StoredCard> = {},
): StoredCard => ({
  ...blankRow(c),
  ...over,
});

/** A review of card `c`, as FSRS would leave it after `days` days with the given stability. */
export const reviewRow = (
  c: CardSummary,
  over: Partial<StoredCard> & { dueInDays?: number; lastDaysAgo?: number } = {},
): StoredCard => {
  const { dueInDays = 0, lastDaysAgo = 5, ...rest } = over;
  return rowFor(c, {
    phase: 'review',
    interday: true,
    due: new Date(NOON + dueInDays * DAY_MS).toISOString(),
    interval: 5,
    stability: 5,
    difficulty: 5,
    reps: 3,
    lastReview: new Date(NOON - lastDaysAgo * DAY_MS).toISOString(),
    ...rest,
  });
};

export interface DataOptions {
  rootId?: string;
  cards?: CardSummary[];
  rows?: StoredCard[];
  active?: string[];
  over?: Partial<StudyData>;
}

export function makeData(o: DataOptions = {}): StudyData {
  const decks = treeDecks();
  const cards = o.cards ?? CARDS;
  return {
    deck: deckDetail(o.rootId ?? ROOT, cards, decks),
    decks,
    authorPresets: [{ name: 'Default', config: { new: { perDay: 9999 }, rev: { perDay: 9999 } } }],
    rows: new Map((o.rows ?? []).map((r) => [cardKey(r), r])),
    answers: [],
    prefs: defaultPreferences(ZONE),
    presets: [],
    settings: [],
    plan: {
      ...EMPTY_PLAN,
      activations: (o.active ?? [UNIT1, UNIT2]).map((deckId) => ({ deckId, active: true })),
    },
    ...o.over,
  };
}
