// What the home page says is left in a course without loading its decks: the new cards that are sure, when the count is
// unknown, which due cards make the order matter, the mastery of the course and when the counts change by themselves.
import { dayStartsAt, fillParameters, schedTiming } from '@qv/srs';
import type { HomeDeckCounts } from '@qv/schema/user';
import { describe, expect, it, vi } from 'vitest';
import { decayByDeck, homeCourseCounts, nextChangeAt } from '../homeCounts';
import type { HomeStudyBase } from '../homeCounts';
import { dateOfDay } from '../examDate';
import {
  ASSESSMENT,
  COURSE,
  EXTRAS,
  NOON,
  UNIT1,
  UNIT2,
  ZONE,
  makeData,
  treeDecks,
} from './studyData';

const today = schedTiming(NOON / 1000, ZONE, 4).today;
const dueSecs = dayStartsAt(today, ZONE, 4);

const stats = (id: string, name: string, parentId: string | null, over = {}) => ({
  id,
  name,
  parentId,
  preset: 'Default',
  semester: null,
  courseId: null,
  assessmentId: null,
  noteCount: 0,
  cardCount: 0,
  ...over,
});

const catalog = (
  counts: Record<string, { own?: number; exclusive?: number; closed?: number }> = {},
) =>
  treeDecks().map((d) => {
    const c = counts[d.id];
    return stats(d.id, d.name, d.parentId, {
      ...(c?.own === undefined ? {} : { ownNoteCount: c.own }),
      ...(c?.exclusive === undefined ? {} : { exclusiveNoteCount: c.exclusive }),
      ...(c?.closed === undefined ? {} : { closedNoteCount: c.closed }),
    });
  });

const deckCounts = (deckId: string, over: Partial<HomeDeckCounts> = {}): HomeDeckCounts => ({
  deckId,
  seen: 0,
  hiddenNew: 0,
  touched: 0,
  suspended: 0,
  recall: 0,
  due: [],
  ...over,
});
const homeOf = (...decks: HomeDeckCounts[]) => new Map(decks.map((d) => [d.deckId, d]));

interface BaseOptions {
  own?: Record<string, number>;
  full?: boolean;
  newPerDay?: number | null;
  includeExtras?: boolean;
  examDate?: string;
  active?: string[];
  presets?: HomeStudyBase['authorPresets'];
  prefs?: object;
  answers?: HomeStudyBase['answers'];
}

function base(o: BaseOptions = {}): HomeStudyBase {
  const own = o.own ?? { [UNIT1]: 30, [UNIT2]: 10, [EXTRAS]: 5 };
  const data = makeData({ active: o.active ?? [UNIT1, UNIT2] });
  const { deck: _deck, rows: _rows, ...rest } = data;
  return {
    ...rest,
    decks: treeDecks(own),
    answers: o.answers ?? [],
    prefs: { ...rest.prefs, fullAnki: o.full ?? false, ...o.prefs },
    authorPresets: o.presets ?? rest.authorPresets,
    plan: {
      ...rest.plan,
      assessments: [
        {
          deckId: ASSESSMENT,
          includeExtras: o.includeExtras ?? false,
          newPerDay: o.newPerDay === undefined ? 8 : o.newPerDay,
          ...(o.examDate ? { examDate: o.examDate } : {}),
        },
      ],
    },
  };
}

const counts = (b: HomeStudyBase, home = new Map<string, HomeDeckCounts>(), cat = catalog()) =>
  homeCourseCounts(b, COURSE, cat, home, NOON);

describe('the new cards of a course', () => {
  const sure = catalog({
    [UNIT1]: { closed: 30, exclusive: 30, own: 30 },
    [UNIT2]: { closed: 10, exclusive: 10, own: 10 },
  });

  it('are the assessment’s number a day when every note of the decks is whole and untouched', () => {
    expect(counts(base(), new Map(), sure).counts).toEqual({ new: 8, learning: 0, review: 0 });
  });

  it('are fewer when only a few remain: what was seen or is hidden does not come again', () => {
    const only = base({ active: [UNIT1] });
    const home = homeOf(deckCounts(UNIT1, { seen: 25, hiddenNew: 3 }));
    expect(counts(only, home, sure).counts?.new).toBe(2);
  });

  it('are unknown when the notes may share decks and the exact number depends on them', () => {
    expect(counts(base()).counts).toBeNull();
  });

  it('are unknown when a note’s cards in other decks may bury one of the day’s', () => {
    const ambiguous = catalog({ [UNIT1]: { closed: 4, exclusive: 4, own: 10 } });
    expect(counts(base({ active: [UNIT1] }), new Map(), ambiguous).counts).toBeNull();
  });

  it('a note touched in a deck below counts against the sure notes of a deck above it', () => {
    const cat = catalog({ [UNIT1]: { closed: 6, exclusive: 6, own: 6 } });
    const touched = homeOf(deckCounts(UNIT1, { touched: 4 }));
    expect(counts(base({ active: [UNIT1] }), touched, cat).counts).toBeNull();
    expect(counts(base({ active: [UNIT1] }), new Map(), cat).counts?.new).toBe(6);
  });

  it('with the exclusive notes only (no closed count), the decks gathered by priority other than «deck» use them', () => {
    const cat = catalog({ [UNIT1]: { exclusive: 30, own: 30 } });
    const priority = {
      authorPresets: [{ name: 'Default', config: { new: { perDay: 9999 }, newGatherPriority: 1 } }],
    };
    const b = { ...base({ active: [UNIT1], full: true, newPerDay: 8 }), ...priority };
    expect(counts(b, new Map(), cat).counts?.new).toBe(8);
  });

  it('burying new siblings, a deck gives one card per note, so three notes are three cards; without it the count depends on the cards', () => {
    const cat = catalog({ [UNIT1]: { closed: 3, exclusive: 3, own: 3 } });
    const withBury = (bury: boolean) =>
      base({
        active: [UNIT1],
        full: true,
        own: { [UNIT1]: 9 },
        presets: [{ name: 'Default', config: { new: { perDay: 8, bury }, rev: { perDay: 9999 } } }],
      });
    expect(counts(withBury(true), new Map(), cat).counts).toEqual({
      new: 3,
      learning: 0,
      review: 0,
    });
    expect(counts(withBury(false), new Map(), cat).counts).toBeNull();
  });

  it('comes out sure when a date decides how many: the day takes all its cards even from the same note', () => {
    const dated = base({ examDate: dateOfDay(today + 30) });
    expect(counts(dated).counts?.new).toBe(Math.ceil(40 / 27));
  });

  it('never builds more than 20 000 placeholder cards for one deck', () => {
    const huge = base({ own: { [COURSE]: 50_000 } });
    const cat = catalog({ [COURSE]: { closed: 50_000, exclusive: 50_000, own: 50_000 } });
    expect(counts(huge, new Map(), cat).counts?.new).toBe(20_000);
  });

  it('a deck that is not giving new cards (Extras off, units off) adds none', () => {
    const cat = catalog({ [EXTRAS]: { closed: 5, exclusive: 5, own: 5 } });
    expect(counts(base({ active: [] }), new Map(), cat).counts?.new).toBe(0);
  });
});

describe('the cards due today', () => {
  const sure = catalog({ [UNIT1]: { closed: 30, exclusive: 30, own: 30 } });
  const due = (noteGuid: string, ord: number, queue: 'l' | 'd' | 'r', at = dueSecs) => ({
    noteGuid,
    ord,
    queue,
    due: at,
  });
  const advanced = (reviewsPerDay: number, extra: BaseOptions = {}) =>
    base({
      active: [UNIT1],
      full: true,
      presets: [
        { name: 'Default', config: { new: { perDay: 0 }, rev: { perDay: reviewsPerDay } } },
      ],
      ...extra,
    });

  it('count as reviews, as learning and as interday learning, each in its queue', () => {
    const home = homeOf(
      deckCounts(UNIT1, {
        due: [
          due('a', 0, 'r'),
          due('b', 0, 'r'),
          due('c', 0, 'l', NOON / 1000 - 60),
          due('d', 0, 'd'),
        ],
      }),
    );
    const out = counts(base({ active: [UNIT1] }), home, sure).counts!;
    expect(out).toMatchObject({ review: 2, learning: 2 });
  });

  it('a learning card due when the next day starts still buries its sibling’s new card, but one a second later does not', () => {
    const nextDayAt = schedTiming(NOON / 1000, ZONE, 4).nextDayAt;
    const cat = catalog({ [UNIT1]: { closed: 1, exclusive: 1, own: 1 } });
    const course = base({ active: [UNIT1], own: { [UNIT1]: 2 } });
    const learningAt = (at: number) =>
      homeOf(deckCounts(UNIT1, { seen: 1, touched: 1, due: [due('n', 0, 'l', at)] }));
    expect(counts(course, learningAt(nextDayAt), cat).counts).toEqual({
      new: 0,
      learning: 0,
      review: 0,
    });
    expect(counts(course, learningAt(nextDayAt + 1), cat).counts).toBeNull();
  });

  it('a learning step later than the learn-ahead window is not counted yet', () => {
    const home = homeOf(deckCounts(UNIT1, { due: [due('c', 0, 'l', NOON / 1000 + 3 * 3600)] }));
    expect(counts(base({ active: [UNIT1] }), home, sure).counts?.learning).toBe(0);
  });

  it('a review limit that the due cards would exceed makes the order matter, so the count is unknown', () => {
    const home = homeOf(
      deckCounts(UNIT1, { due: [due('a', 0, 'r'), due('b', 0, 'r'), due('c', 0, 'r')] }),
    );
    expect(counts(advanced(2), home, sure).counts).toBeNull();
    expect(counts(advanced(3), home, sure).counts?.review).toBe(3);
  });

  it('what was answered today uses up the limit, new cards included', () => {
    const home = homeOf(deckCounts(UNIT1, { due: [due('a', 0, 'r'), due('b', 0, 'r')] }));
    const answered = [{ deckId: UNIT1, queueBefore: 'new' as const }];
    expect(counts(advanced(2, { answers: answered }), home, sure).counts).toBeNull();
    expect(counts(advanced(3, { answers: answered }), home, sure).counts?.review).toBe(2);
  });

  it('with a limit of zero left, the limit is reached by any due card', () => {
    const home = homeOf(deckCounts(UNIT1, { due: [due('a', 0, 'r')] }));
    expect(counts(advanced(0), home, sure).counts).toBeNull();
  });

  it('the limit of a deck above counts only when the student applies the limits from above', () => {
    const parentLimit = [
      { name: 'Default', config: { new: { perDay: 0 }, rev: { perDay: 9999 } } },
      { name: 'Tight', config: { new: { perDay: 0 }, rev: { perDay: 1 } } },
    ];
    const b = (applyAllParentLimits: boolean) => {
      const out = base({
        active: [UNIT1],
        full: true,
        presets: parentLimit,
        prefs: { applyAllParentLimits },
      });
      return {
        ...out,
        decks: out.decks.map((d) => (d.id === COURSE ? { ...d, authorPreset: 'Tight' } : d)),
      };
    };
    const home = homeOf(deckCounts(UNIT1, { due: [due('a', 0, 'r'), due('b', 0, 'r')] }));
    expect(homeCourseCounts(b(false), ASSESSMENT, catalog(), home, NOON).counts?.review).toBe(2);
    expect(homeCourseCounts(b(true), ASSESSMENT, catalog(), home, NOON).counts).toBeNull();
  });

  it('two cards of one note due in the same queue, in decks whose presets bury differently, make the order matter', () => {
    const mixed = [
      { name: 'Default', config: { new: { perDay: 0 }, rev: { perDay: 9999, bury: true } } },
      { name: 'Loose', config: { new: { perDay: 0 }, rev: { perDay: 9999, bury: false } } },
    ];
    const b = base({ active: [UNIT1, UNIT2], full: true, presets: mixed });
    const loose = {
      ...b,
      decks: b.decks.map((d) => (d.id === UNIT2 ? { ...d, authorPreset: 'Loose' } : d)),
    };
    const split = homeOf(
      deckCounts(UNIT1, { due: [due('x', 0, 'r')] }),
      deckCounts(UNIT2, { due: [due('x', 1, 'r')] }),
    );
    expect(counts(loose, split, sure).counts).toBeNull();
    const alike = homeOf(deckCounts(UNIT1, { due: [due('x', 0, 'r'), due('y', 0, 'r')] }));
    expect(counts(loose, alike, sure).counts?.review).toBe(2);
  });

  it('interday learning is judged by its own bury option, apart from reviews’', () => {
    const mixed = [
      {
        name: 'Default',
        config: { new: { perDay: 0 }, rev: { perDay: 9999 }, buryInterdayLearning: true },
      },
      {
        name: 'Loose',
        config: { new: { perDay: 0 }, rev: { perDay: 9999 }, buryInterdayLearning: false },
      },
    ];
    const b = base({ active: [UNIT1, UNIT2], full: true, presets: mixed });
    const loose = {
      ...b,
      decks: b.decks.map((d) => (d.id === UNIT2 ? { ...d, authorPreset: 'Loose' } : d)),
    };
    const split = homeOf(
      deckCounts(UNIT1, { due: [due('x', 0, 'd')] }),
      deckCounts(UNIT2, { due: [due('x', 1, 'd')] }),
    );
    expect(counts(loose, split, sure).counts).toBeNull();
  });

  it('a note only buries what its due cards’ presets say: a due card of a preset that does not bury leaves the others’ new cards', () => {
    const mixed = [
      { name: 'Default', config: { new: { perDay: 8, bury: true }, rev: { perDay: 9999 } } },
      { name: 'Loose', config: { new: { perDay: 8, bury: false }, rev: { perDay: 9999 } } },
    ];
    const b = base({ own: { [UNIT1]: 8 }, active: [UNIT1, UNIT2], full: true, presets: mixed });
    const loose = {
      ...b,
      decks: b.decks.map((d) => (d.id === UNIT2 ? { ...d, authorPreset: 'Loose' } : d)),
    };
    const cat = catalog({ [UNIT1]: { closed: 8, exclusive: 8, own: 8 } });
    const home = homeOf(
      deckCounts(UNIT1, { due: [due('x', 1, 'r', dueSecs + 86_400)] }),
      deckCounts(UNIT2, { due: [due('x', 0, 'r')] }),
    );
    expect(counts(loose, home, cat).counts).toMatchObject({ new: 8, review: 1 });
  });

  it('a card of a note in a bury-new preset takes that note’s new cards out of the count', () => {
    const cat = catalog({ [UNIT1]: { closed: 5, exclusive: 5, own: 10 } });
    const home = homeOf(deckCounts(UNIT1, { due: [due('x', 0, 'r')] }));
    expect(counts(base({ active: [UNIT1] }), home, cat).counts).toBeNull();
  });
});

describe('the mastery of a course', () => {
  it('is the recall of its decks over the cards seen', () => {
    const home = homeOf(
      deckCounts(UNIT1, { seen: 20, recall: 15 }),
      deckCounts(UNIT2, { seen: 10, recall: 5 }),
    );
    expect(counts(base(), home).mastery).toBeCloseTo(20 / 30, 10);
  });

  it('does not count the seen cards that are suspended: all suspended but the new ones of deck_progress()', () => {
    const home = homeOf(
      deckCounts(UNIT1, { seen: 20, recall: 15, suspended: 10 }),
      deckCounts(UNIT2, { seen: 4, recall: 3, suspended: 2 }),
    );
    const progress = [UNIT1, UNIT2].map((deckId) => ({
      deckId,
      seen: 0,
      newSuspended: 6,
      overdue: 0,
      newToday: 0,
      newYesterday: 0,
    }));
    expect(counts({ ...base(), progress }, home).mastery).toBeCloseTo(18 / 20, 10);
  });

  it('leaves Extras out unless the assessment includes them', () => {
    const home = homeOf(
      deckCounts(UNIT1, { seen: 20, recall: 15 }),
      deckCounts(EXTRAS, { seen: 5, recall: 4 }),
    );
    expect(counts(base(), home).mastery).toBeCloseTo(15 / 20, 10);
    expect(counts(base({ includeExtras: true }), home).mastery).toBeCloseTo(19 / 25, 10);
  });

  it('is null while nothing was seen', () => {
    expect(counts(base({ own: {} })).mastery).toBeNull();
    expect(
      counts(base(), homeOf(deckCounts(UNIT1, { suspended: 3, hiddenNew: 3 }))).mastery,
    ).toBeNull();
  });
});

describe('decayByDeck', () => {
  it('gives the decay of the FSRS parameters each deck’s preset uses', () => {
    const custom = Array.from({ length: 21 }, (_, i) => (i === 20 ? 0.77 : 1));
    const b = base({
      presets: [{ name: 'Default', config: { fsrsParams6: custom } }],
    });
    const out = decayByDeck(b, [UNIT1, UNIT2], NOON);
    expect(out).toEqual({ [UNIT1]: 0.77, [UNIT2]: 0.77 });
  });

  it('is the default decay when the preset has no parameters', () => {
    expect(decayByDeck(base(), [UNIT1], NOON)).toEqual({ [UNIT1]: fillParameters([])[20] });
  });

  it('leaves out the decks it does not know, and an empty list gives nothing', () => {
    expect(Object.keys(decayByDeck(base(), ['nope', UNIT1], NOON))).toEqual([UNIT1]);
    expect(decayByDeck(base(), [], NOON)).toEqual({});
  });
});

describe('nextChangeAt', () => {
  const step = (minutes: number, queue: 'l' | 'd' | 'r' = 'l') => ({
    noteGuid: `n${minutes}${queue}`,
    ord: 0,
    queue,
    due: NOON / 1000 + minutes * 60,
  });

  it('is the moment the first learning step of today enters the learn-ahead window', () => {
    const home = homeOf(
      deckCounts(UNIT1, { due: [step(90), step(50)] }),
      deckCounts(UNIT2, { due: [step(70)] }),
    );
    expect(nextChangeAt(home, 20, NOON)).toBe(NOON + 30 * 60_000);
  });

  it('skips steps already inside the window or at its edge, and cards that are not steps of today', () => {
    const home = homeOf(
      deckCounts(UNIT1, { due: [step(10), step(20), step(45, 'd'), step(60, 'r')] }),
    );
    expect(nextChangeAt(home, 20, NOON)).toBeNull();
  });

  it('is null with nothing at all', () => {
    expect(nextChangeAt(new Map(), 20, NOON)).toBeNull();
  });

  it('without a time given it uses the clock', () => {
    const home = homeOf(deckCounts(UNIT1, { due: [step(90)] }));
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
    try {
      expect(nextChangeAt(home, 20)).toBe(NOON + 70 * 60_000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('what the home page has not been told', () => {
  it('a course that is not in the tree cannot be counted', () => {
    expect(() => homeCourseCounts(base(), 'ghost', catalog(), new Map(), NOON)).toThrow(
      'Mazo ghost no encontrado',
    );
  });

  it('a deck without its own count of cards gives no new ones, and with nothing seen there is no mastery', () => {
    const b = base({ own: {} });
    const home = homeOf(deckCounts(UNIT1, { recall: 9 }));
    expect(counts(b, home).counts).toEqual({ new: 0, learning: 0, review: 0 });
    expect(counts(b, home).mastery).toBeNull();
    const noCount = { ...base(), decks: base().decks.map(({ ownCards: _own, ...d }) => d) };
    expect(counts(noCount).mastery).toBeNull();
  });

  it('a card due after today is not counted today, whether it is a review or a day-learning card', () => {
    const tomorrow = dueSecs + 86_400;
    const home = homeOf(
      deckCounts(UNIT1, {
        due: [
          { noteGuid: 'r', ord: 0, queue: 'r', due: tomorrow },
          { noteGuid: 'd', ord: 0, queue: 'd', due: tomorrow },
          { noteGuid: 'ok', ord: 0, queue: 'r', due: dueSecs },
        ],
      }),
    );
    const sure = catalog({ [UNIT1]: { closed: 30, exclusive: 30, own: 30 } });
    expect(counts(base({ active: [UNIT1] }), home, sure).counts).toMatchObject({
      review: 1,
      learning: 0,
    });
  });

  it('an Extras deck whose assessment is missing from the tree is left out of the mastery', () => {
    const b = base();
    const noAssessment = { ...b, decks: b.decks.filter((d) => d.id !== ASSESSMENT) };
    const home = homeOf(
      deckCounts(EXTRAS, { seen: 5, recall: 5 }),
      deckCounts(UNIT1, { seen: 20, recall: 15 }),
    );
    expect(homeCourseCounts(noAssessment, COURSE, catalog(), home, NOON).mastery).toBeCloseTo(
      15 / 20,
      10,
    );
  });
});
