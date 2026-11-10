import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayStartsAt } from '@qv/srs';
import type { AnkiTreeDeck, CardSummary } from '@qv/schema';
import { deckCounts } from '../study/DeckCounts';
import { masteryByDeck } from '../study/mastery';
import { defaultPreferences, localStudyRepository } from '../study/repository';
import type { AnswerToday, DeckProgress, StoredCard, UserPreset } from '../study/repository';
import { blankRow } from '../study/session';
import { cardKey, timingFor } from '../study/scheduler';
import type { StudyData, TreeDeck } from '../study/scheduler';
import { EMPTY_PLAN } from '../study/simple';
import { decayByDeck, homeCourseCounts } from './counts';

/**
 * Review of step 3.2: «Hoy» without the deck against the study screen in harder courses than counts.test.ts: two
 * assessments, notes split across topics, weeks and assessments, cards in the week decks, relearning, learning steps
 * after the learn-ahead limit, burials that already ended, answers of today, the assessment mode with progress, and in
 * «Modo avanzado» the student's presets with small review limits, every gather priority and review order, and burying
 * that differs from deck to deck. Before the review, «Modo avanzado» gave other numbers in about 1 of 400 courses: the
 * order of the cards due today mattered (dueOrderMatters()).
 */

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.parse('2026-11-09T15:00:00Z');
const MIN = 60_000;
const DAY = 86_400_000;
const COURSE = '3';
const TZ = 'America/Santiago';

const GATHER = [
  'deck',
  'deckThenRandomNotes',
  'lowestPosition',
  'highestPosition',
  'randomNotes',
  'randomCards',
];
const REVIEW = [
  'day',
  'dayThenDeck',
  'deckThenDay',
  'intervalsAscending',
  'random',
  'added',
  'retrievabilityAscending',
];

/** A harder course: two assessments, notes split across topics, weeks and assessments, cards in the week decks. */
function scenario(seed: number, mode: 'any' | 'simple' | 'advanced' = 'any') {
  const rnd = random(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const decks: TreeDeck[] = [];
  const add = (id: string, name: string, parentId: string | null, preset = 'Default') =>
    decks.push({ id, name, label: name.split('::').at(-1)!, parentId, authorPreset: preset });
  add('1', 'R', null);
  add('2', 'R::S1', '1');
  add(COURSE, 'R::S1::C', '2');
  for (const a of [1, 2]) {
    add(`4${a}`, `R::S1::C::A${a}`, COURSE);
    for (const w of [1, 2]) {
      add(`5${a}${w}`, `R::S1::C::A${a}::W${w}`, `4${a}`);
      for (const d of [1, 2]) {
        add(`6${a}${w}${d}`, `R::S1::C::A${a}::W${w}::D${d}`, `5${a}${w}`);
        add(`7${a}${w}${d}`, `R::S1::C::A${a}::W${w}::D${d}::Extras`, `6${a}${w}${d}`, 'Extras');
      }
    }
  }
  const leaves = decks.filter((d) => d.name.split('::').length >= 5).map((d) => d.id);
  const cards: CardSummary[] = [];
  const notes = 4 + Math.floor(rnd() * 60);
  for (let i = 0; i < notes; i++) {
    const size = 1 + Math.floor(rnd() * 4);
    const homeDeck = pick(leaves);
    const other = pick(leaves);
    const where = rnd();
    for (let ord = 0; ord < size; ord++) {
      const deckId = where < 0.55 ? homeDeck : ord % 2 ? other : homeDeck;
      cards.push({
        noteGuid: `n${String(i).padStart(3, '0')}`,
        ord,
        deckId,
        code: null,
        version: null,
        kind: 'basic',
        text: '',
      });
    }
  }
  const today = timingFor(defaultPreferences(TZ), NOW).today;
  const seenShare = pick([0, 0.2, 0.5, 0.8, 1]);
  const rows = new Map<string, StoredCard>();
  for (const c of cards) {
    if (rnd() > seenShare) continue;
    const kind = pick([
      'review',
      'review',
      'learn',
      'learnLate',
      'dayLearn',
      'relearn',
      'forgotten',
      'later',
    ]);
    const base = {
      ...blankRow(c),
      stability: 0.5 + rnd() * 30,
      difficulty: 1 + rnd() * 9,
      reps: 2,
      interval: 1 + Math.floor(rnd() * 30),
    };
    const lastReview = new Date(NOW - Math.floor(rnd() * 20 * DAY)).toISOString();
    let row: StoredCard;
    if (kind === 'forgotten') row = { ...blankRow(c), reps: 3 };
    else if (kind === 'learn' || kind === 'relearn' || kind === 'learnLate') {
      const offset = kind === 'learnLate' ? (10 + rnd() * 30) * 60 : rnd() * 90 - 30;
      row = {
        ...base,
        phase: kind === 'relearn' ? 'relearning' : 'learning',
        due: new Date(NOW + offset * MIN).toISOString(),
        lastReview,
      };
    } else {
      const days = kind === 'later' ? 1 + Math.floor(rnd() * 10) : -Math.floor(rnd() * 6);
      row = {
        ...base,
        phase: kind === 'dayLearn' ? pick(['learning', 'relearning'] as const) : 'review',
        interday: true,
        due: new Date(dayStartsAt(today + days, TZ, 4) * 1000).toISOString(),
        lastReview,
      };
    }
    if (rnd() < 0.08) row.suspended = true;
    if (rnd() < 0.06) row.buriedUntil = new Date(NOW + 5 * 3600_000).toISOString();
    if (rnd() < 0.04) row.buriedUntil = new Date(NOW - 5 * 3600_000).toISOString();
    rows.set(cardKey(c), row);
  }
  const own = new Map<string, number>();
  for (const c of cards) own.set(c.deckId, (own.get(c.deckId) ?? 0) + 1);
  for (const d of decks) d.ownCards = own.get(d.id) ?? 0;
  const full = mode === 'advanced' ? true : mode === 'simple' ? false : rnd() < 0.5;
  const units = decks.filter((d) => d.name.split('::').length === 5);
  // User presets of «Modo avanzado», with burying and limits that differ from deck to deck.
  const presets: UserPreset[] = [];
  const settings: { deckId: string; presetId: string | null; authorPreset: string | null }[] = [];
  if (full) {
    for (let p = 0; p < 3; p++) {
      presets.push({
        id: `p${p}`,
        name: `P${p}`,
        replaces: null,
        updatedAt: '',
        config: {
          newPerDay: pick([0, 1, 3, 10, 50]),
          reviewsPerDay: pick([1, 3, 10, 200]),
          buryNew: rnd() < 0.5,
          buryReviews: rnd() < 0.5,
          buryInterdayLearning: rnd() < 0.5,
          newCardGatherPriority: pick(GATHER),
          reviewOrder: pick(REVIEW),
        },
      });
    }
    for (const d of decks) {
      if (rnd() < 0.6)
        settings.push({ deckId: d.id, presetId: pick(presets).id, authorPreset: null });
    }
  }
  const answers: AnswerToday[] = [];
  for (let i = Math.floor(rnd() * 6); i > 0; i--) {
    answers.push({
      deckId: pick(leaves),
      queueBefore: pick(['new', 'learn', 'day_learn', 'review'] as const),
    });
  }
  const progress: DeckProgress[] = leaves.map((id) => ({
    deckId: id,
    seen: Math.floor(rnd() * 5),
    newSuspended: 0,
    overdue: Math.floor(rnd() * 3),
    newToday: Math.floor(rnd() * 3),
    newYesterday: Math.floor(rnd() * 3),
  }));
  const data: StudyData = {
    deck: {
      id: COURSE,
      name: 'C',
      fullName: 'R::S1::C',
      description: '',
      courseId: null,
      assessmentId: null,
      preset: 'Default',
      noteCount: notes,
      cardCount: cards.length,
      subdecks: decks
        .filter((d) => d.name.startsWith('R::S1::C::'))
        .map((d) => ({
          id: d.id,
          name: d.label,
          parentId: d.parentId,
          preset: d.authorPreset,
          cardCount: 0,
        })),
      cards,
      presets: [],
    },
    decks,
    authorPresets: [
      {
        name: 'Default',
        config: {
          new: { perDay: pick([3, 10, 20, 50]), bury: rnd() < 0.5 },
          rev: { perDay: pick([2, 5, 200]), bury: rnd() < 0.5 },
          newGatherPriority: pick([0, 1, 3, 5]),
        },
      },
      { name: 'Extras', config: { new: { perDay: 0, bury: rnd() < 0.5 }, rev: { perDay: 4 } } },
    ],
    rows,
    answers,
    prefs: {
      ...defaultPreferences(TZ),
      fullAnki: full,
      learnAheadMinutes: pick([0, 20, 60]),
      applyAllParentLimits: rnd() < 0.5,
      newCardsIgnoreReviewLimit: rnd() < 0.5,
    },
    presets,
    settings,
    plan: {
      ...EMPTY_PLAN,
      activations: units.map((d) => ({ deckId: d.id, active: rnd() < 0.7 })),
      answeredDecks: rnd() < 0.3 ? [pick(leaves)] : [],
      assessments: ['41', '42'].map((id) => ({
        deckId: id,
        includeExtras: rnd() < 0.5,
        newPerDay: pick([null, 1, 2, 5, 15, 40]),
        examDate: rnd() < 0.3 ? pick(['2026-11-12', '2026-11-25', '2026-12-20']) : null,
        finalReviewDays: pick([1, 3, 7]),
      })),
    },
    progress,
  };
  return { data, cards };
}

function catalogOf(data: StudyData, cards: CardSummary[]): AnkiTreeDeck[] {
  return data.decks.map((d) => {
    const mine = cards.filter((c) => c.deckId === d.id);
    const below = data.decks.filter((x) => x.name === d.name || x.name.startsWith(`${d.name}::`));
    const notes = new Set(mine.map((c) => c.noteGuid));
    return {
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      preset: d.authorPreset,
      semester: null,
      courseId: null,
      assessmentId: null,
      noteCount: 0,
      cardCount: 0,
      ownNoteCount: notes.size,
      exclusiveNoteCount: [...notes].filter((n) =>
        cards.filter((c) => c.noteGuid === n).every((c) => c.deckId === d.id),
      ).length,
      closedNoteCount: [...notes].filter((n) =>
        cards.filter((c) => c.noteGuid === n).every((c) => below.some((x) => x.id === c.deckId)),
      ).length,
    };
  });
}

afterEach(() => vi.useRealTimers());

describe('«Hoy» without the deck, harder courses', () => {
  for (const mode of ['simple', 'advanced'] as const) {
    it(`never a number different from the study screen (${mode})`, async () => {
      vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
      let exact = 0;
      let unknown = 0;
      const wrong: unknown[] = [];
      const seeds = Number(process.env.QV_SEEDS ?? 1000);
      for (let seed = 1; seed <= seeds; seed++) {
        const { data, cards } = scenario(seed * 7919 + (mode === 'simple' ? 1 : 2), mode);
        const store = new Map<string, string>();
        const storage = {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => void store.set(k, v),
        } as unknown as Storage;
        storage.setItem('qv-demo-study', JSON.stringify({ cards: [...data.rows.values()] }));
        const repo = localStudyRepository(storage);
        const { deck: _deck, rows: _rows, ...base } = data;
        const ids = data.decks.map((d) => d.id);
        const today = timingFor(data.prefs, NOW).today;
        const until = new Date(dayStartsAt(today + 1, TZ, 4) * 1000);
        const home = await repo.homeCounts(ids, until, decayByDeck(base, ids, NOW));
        const result = homeCourseCounts(
          base,
          COURSE,
          catalogOf(data, cards),
          new Map(home.decks.map((d) => [d.deckId, d])),
          NOW,
        );
        const real = deckCounts(data, NOW).get(COURSE)!;
        expect(result.mastery).toBeCloseTo(masteryByDeck(data, NOW).get(COURSE)!, 9);
        if (result.counts) {
          exact++;
          if (JSON.stringify(result.counts) !== JSON.stringify(real))
            wrong.push({ seed, home: result.counts, real });
        } else unknown++;
      }
      if (process.env.QV_SEEDS) console.log(mode, 'exact', exact, 'unknown', unknown);
      expect(wrong).toEqual([]);
      // Not empty: a good part of them it knows without the deck.
      expect(exact).toBeGreaterThan(seeds / 10);
    }, 120_000);
  }
});
