// What the end of a session says: why nothing is left today, when the next learning card comes, and the assessment’s
// notes; and whether today has answers or an assessment was ever seen.
import { schedTiming } from '@qv/srs';
import { describe, expect, it } from 'vitest';
import { answeredTodayIn, congratsInfo, hasSeenAssessment } from '../congrats';
import { dateOfDay } from '../pace';
import {
  ASSESSMENT,
  CARDS,
  DAY_MS,
  EXTRAS,
  NOON,
  UNIT1,
  UNIT2,
  ZONE,
  makeData,
  reviewRow,
  rowFor,
  treeDecks,
} from './studyData';

const [n1o0, n1o1, n2o0, n3o0, n4o0] = CARDS as [
  (typeof CARDS)[0],
  (typeof CARDS)[0],
  (typeof CARDS)[0],
  (typeof CARDS)[0],
  (typeof CARDS)[0],
];
const AHEAD = 1200;
const info = (data = makeData({ rows: [] }), rootId = UNIT1) =>
  congratsInfo(data, rootId, NOON, AHEAD);
const learning = (c: typeof n1o0, minutes: number) =>
  rowFor(c, {
    phase: 'learning',
    due: new Date(NOON + minutes * 60_000).toISOString(),
    lastReview: new Date(NOON).toISOString(),
    remainingSteps: 1,
    reps: 1,
  });

describe('why nothing is left today', () => {
  it('a new card of a unit that is turned on means the day’s new limit was reached', () => {
    const data = makeData({ cards: [n1o0], rows: [] });
    expect(info(data)).toMatchObject({
      newLimitReached: true,
      inactiveNew: 0,
      nothingActive: false,
    });
  });

  it('a new card of a unit that is turned off is only waiting for the unit, and Extras do not count', () => {
    const data = makeData({ cards: [n3o0], rows: [], active: [UNIT1] });
    expect(info(data, UNIT2)).toMatchObject({
      newLimitReached: false,
      inactiveNew: 1,
      nothingActive: true,
    });
    const extras = makeData({ cards: [n4o0], rows: [], active: [] });
    expect(info(extras, EXTRAS)).toMatchObject({ inactiveNew: 0, newLimitReached: false });
  });

  it('only the Extras of an active unit leave «nothing active» true, since turning them on is another switch', () => {
    const data = makeData({ cards: [n4o0], rows: [] });
    expect(info(data, EXTRAS).nothingActive).toBe(true);
  });

  it('a review due today means the review limit was reached; due tomorrow is only said as tomorrow’s', () => {
    const today = reviewRow(n1o0, { dueInDays: 0 });
    const tomorrow = reviewRow(n2o0, { dueInDays: 1 });
    const later = reviewRow(n1o1, { dueInDays: 5 });
    const data = makeData({ rows: [today, tomorrow, later] });
    expect(info(data)).toMatchObject({ reviewLimitReached: true, dueTomorrow: 1 });
    const onlyLater = makeData({ rows: [later] });
    expect(info(onlyLater)).toMatchObject({ reviewLimitReached: false, dueTomorrow: 0 });
  });

  it('a buried card is said, a suspended one is not', () => {
    const buried = reviewRow(n1o0, { buriedUntil: new Date(NOON + 3 * 3600_000).toISOString() });
    const suspended = reviewRow(n2o0, { suspended: true, dueInDays: 0 });
    expect(info(makeData({ rows: [buried] })).buried).toBe(true);
    const only = info(makeData({ rows: [suspended] }));
    expect(only).toMatchObject({ buried: false, reviewLimitReached: false });
  });

  it('a buried card whose burial already ended is not buried', () => {
    const over = reviewRow(n1o0, {
      buriedUntil: new Date(NOON - 1000).toISOString(),
      dueInDays: 3,
    });
    expect(info(makeData({ rows: [over] })).buried).toBe(false);
  });

  it('cards outside the deck being studied are not looked at', () => {
    const data = makeData({ rows: [reviewRow(n3o0, { dueInDays: 0 })] });
    expect(info(data, UNIT1).reviewLimitReached).toBe(false);
    expect(info(data, UNIT2).reviewLimitReached).toBe(true);
  });
});

describe('the next learning card', () => {
  it('says how long until it enters the learn-ahead window, and how many are left', () => {
    const data = makeData({ rows: [learning(n1o0, 30)] });
    expect(info(data).learnMessage).toBe(
      'La próxima tarjeta estará lista en 10 minutos. Hay una tarjeta restante en la cola de aprendizaje programada para hoy más tarde.',
    );
  });

  it('is never under a minute, and takes the earliest of several', () => {
    const data = makeData({ rows: [learning(n1o0, 5), learning(n2o0, 90), learning(n1o1, 40)] });
    expect(info(data).learnMessage).toBe(
      'La próxima tarjeta estará lista en 1 minuto. Hay 3 tarjetas restantes en la cola de aprendizaje programadas para hoy más tarde.',
    );
  });

  it('says nothing when no card is in learning', () => {
    expect(info(makeData({ rows: [reviewRow(n1o0)] })).learnMessage).toBe('');
  });

  it('a learn-ahead limit of zero counts the full wait', () => {
    const data = makeData({ rows: [learning(n1o0, 30)] });
    expect(congratsInfo(data, UNIT1, NOON, 0).learnMessage).toMatch(/30 minutos/);
  });
});

describe('Extras', () => {
  const included = {
    activations: [],
    answeredDecks: [],
    medianAnswerMs: null,
    assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }],
  };

  it('are off when studying an Extras deck the assessment does not include', () => {
    expect(info(makeData({ cards: [n4o0], rows: [] }), EXTRAS).extrasOff).toBe(true);
    expect(
      info(makeData({ cards: [n4o0], rows: [], over: { plan: included } }), EXTRAS).extrasOff,
    ).toBe(false);
    expect(info(makeData({ rows: [] }), UNIT1).extrasOff).toBe(false);
  });
});

describe('the assessment’s notes', () => {
  const today = schedTiming(NOON / 1000, ZONE, 4).today;
  const withExam = (daysLeft: number | null, extra: object = {}, progress: object[] = []) => {
    const decks = treeDecks({ [UNIT1]: 100 });
    const plan = {
      activations: [{ deckId: UNIT1, active: true }],
      answeredDecks: [],
      medianAnswerMs: null,
      assessments: [
        {
          deckId: ASSESSMENT,
          includeExtras: false,
          newPerDay: 20,
          examDate: daysLeft === null ? null : dateOfDay(today + daysLeft),
          ...extra,
        },
      ],
    };
    return makeData({ rows: [], over: { decks, plan, progress: progress as never } });
  };

  it('has none when the deck studied is above the assessments', () => {
    expect(info(withExam(20), '1').exam).toBeNull();
  });

  it('says the new cards are computed from the date', () => {
    expect(info(withExam(20)).exam).toMatchObject({
      computed: true,
      finalReview: false,
      lastNewDay: false,
      roseTo: null,
    });
  });

  it('says it is the final review when the days left are the review’s', () => {
    expect(info(withExam(2)).exam).toMatchObject({ computed: false, finalReview: true });
  });

  it('knows the last day with new cards', () => {
    expect(info(withExam(4)).exam?.lastNewDay).toBe(true);
    expect(info(withExam(5)).exam?.lastNewDay).toBe(false);
  });

  it('says to what number the day’s new cards rose when yesterday’s were left undone', () => {
    const exam = withExam(12, { examDateSetAt: new Date(NOON - 3 * DAY_MS).toISOString() });
    expect(info(exam).exam).toMatchObject({ computed: true, roseTo: 12 });
  });

  it('counts what is overdue in the assessment’s other decks as a plan to catch up, but not what this session cleared', () => {
    const progress = [
      { deckId: UNIT2, seen: 0, newSuspended: 0, overdue: 80, newToday: 0, newYesterday: 0 },
      { deckId: UNIT1, seen: 0, newSuspended: 0, overdue: 300, newToday: 0, newYesterday: 0 },
    ];
    const exam = info(withExam(20, {}, progress)).exam;
    expect(exam?.catchUp).toMatchObject({ overdue: 80 });
  });
});

describe('answeredTodayIn', () => {
  const data = makeData({ over: { answers: [{ deckId: UNIT2, queueBefore: 'review' }] } });

  it('is true when one of the decks has an answer today', () => {
    expect(answeredTodayIn(data, new Set([UNIT1, UNIT2]))).toBe(true);
    expect(answeredTodayIn(data, new Set([UNIT1]))).toBe(false);
    expect(answeredTodayIn(makeData(), new Set([UNIT1]))).toBe(false);
  });
});

describe('hasSeenAssessment', () => {
  const seen = (deckId: string, seenCount: number) => ({
    deckId,
    seen: seenCount,
    newSuspended: 0,
    overdue: 0,
    newToday: 0,
    newYesterday: 0,
  });

  it('is true when a deck inside it has cards seen', () => {
    expect(hasSeenAssessment(makeData({ over: { progress: [seen(UNIT1, 3)] } }), ASSESSMENT)).toBe(
      true,
    );
  });

  it('is true when something was answered today in it, even without progress rows', () => {
    const data = makeData({ over: { answers: [{ deckId: UNIT2, queueBefore: 'new' }] } });
    expect(hasSeenAssessment(data, ASSESSMENT)).toBe(true);
  });

  it('is false for rows of 0 seen, of decks outside it, or without progress at all', () => {
    expect(
      hasSeenAssessment(
        makeData({ over: { progress: [seen(UNIT1, 0), seen('2', 9)] } }),
        ASSESSMENT,
      ),
    ).toBe(false);
    expect(hasSeenAssessment(makeData(), ASSESSMENT)).toBe(false);
  });

  it('is false for a deck that does not exist', () => {
    expect(hasSeenAssessment(makeData({ over: { progress: [seen(UNIT1, 3)] } }), 'nope')).toBe(
      false,
    );
  });
});

describe('a deck that is not in the tree', () => {
  it('has no cards to say anything about and no assessment, and counts as nothing active', () => {
    const out = info(makeData({ rows: [] }), 'ghost');
    expect(out).toMatchObject({
      exam: null,
      nothingActive: true,
      extrasOff: false,
      newLimitReached: false,
    });
  });
});
