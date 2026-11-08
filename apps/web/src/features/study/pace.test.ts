import { dayStartsAt, schedTiming } from '@qv/srs';
import { describe, expect, it } from 'vitest';
import { defaultPreferences } from './repository';
import type { DeckProgress } from './repository';
import {
  LARGE_BACKLOG,
  LONGEST_CATCH_UP,
  LONGEST_STATUS,
  UNREALISTIC_MINUTES,
  assessmentFacts,
  assessmentPaces,
  assessmentView,
  catchUpPlan,
  catchUpText,
  computePace,
  dateOfDay,
  dayOfDate,
  daysLeftText,
  examSummary,
  isExamDate,
  longDate,
  shortDate,
  nearestExamText,
  newAtDayStart,
  paceOptions,
  paceRose,
  planMinutes,
  rollProgress,
} from './pace';
import type { AssessmentFacts } from './pace';
import { EMPTY_PLAN } from './simple';
import type { StudyPlan } from './simple';

const ASSESSMENT = '4';
const L1 = '51';
const L1_EXTRAS = '61';
const L2 = '52';
const OTHER = '9';
const OTHER_L = '91';

/** Two lectures, the first with its Extras, and another assessment. */
const DECKS = [
  { id: '3', name: 'R::S::C', ownCards: 0 },
  { id: ASSESSMENT, name: 'R::S::C::A', ownCards: 0 },
  { id: L1, name: 'R::S::C::A::08 - L1', ownCards: 100 },
  { id: L1_EXTRAS, name: 'R::S::C::A::08 - L1::Extras', ownCards: 40 },
  { id: L2, name: 'R::S::C::A::09 - L2', ownCards: 60 },
  { id: OTHER, name: 'R::S::C::B', ownCards: 0 },
  { id: OTHER_L, name: 'R::S::C::B::01 - L', ownCards: 500 },
];

const TODAY = dayOfDate('2026-11-01');
const inDays = (n: number) => dateOfDay(TODAY + n);

const plan = (over: Partial<StudyPlan> = {}): StudyPlan => ({
  ...EMPTY_PLAN,
  activations: [{ deckId: L1, active: true }],
  ...over,
});
const dated = (days: number, over: object = {}) => ({
  deckId: ASSESSMENT,
  includeExtras: false,
  newPerDay: 15,
  examDate: inDays(days),
  ...over,
});
const row = (deckId: string, over: Partial<DeckProgress> = {}): DeckProgress => ({
  deckId,
  seen: 0,
  newSuspended: 0,
  overdue: 0,
  newToday: 0,
  newYesterday: 0,
  ...over,
});
const facts = (over: Partial<AssessmentFacts> = {}): AssessmentFacts => ({
  newLeft: 100,
  newToday: 0,
  newYesterday: 0,
  seen: 0,
  overdue: 0,
  anyOn: true,
  unitsOff: 0,
  unitIsWeek: false,
  ...over,
});

describe('the days left', () => {
  it('a calendar day is the scheduler’s day number, whatever the zone', () => {
    for (const zone of ['America/Santiago', 'Asia/Tokyo', 'UTC']) {
      // Noon of the 5th, in that zone.
      const noon = dayStartsAt(dayOfDate('2026-11-05'), zone, 12);
      expect(schedTiming(noon, zone, 4).today).toBe(dayOfDate('2026-11-05'));
    }
  });

  it('before the rollover hour it is still yesterday: the day is not shifted', () => {
    const zone = 'America/Santiago';
    const day = dayOfDate('2026-11-05');
    const startOfDay = dayStartsAt(day, zone, 4);
    expect(schedTiming(startOfDay - 60, zone, 4).today).toBe(day - 1);
    expect(schedTiming(startOfDay + 60, zone, 4).today).toBe(day);
    // The test is on the 5th: at 3:59 of that day there is still one to go; at 4:01, none.
    expect(day - schedTiming(startOfDay - 60, zone, 4).today).toBe(1);
    expect(day - schedTiming(startOfDay + 60, zone, 4).today).toBe(0);
  });

  it('0 days left on the day of the test', () => {
    expect(daysLeftText(0)).toBe('Hoy es la prueba');
    expect(daysLeftText(1)).toBe('Falta 1 día');
    expect(daysLeftText(12)).toBe('Faltan 12 días');
    expect(computePace({ examDate: inDays(0) }, facts(), TODAY, 15)).toMatchObject({ daysLeft: 0 });
  });

  it('a date field takes dates and not what it goes through while somebody types', () => {
    expect(isExamDate('2026-11-05')).toBe(true);
    expect(isExamDate('')).toBe(false);
    expect(isExamDate('0020-11-05')).toBe(false);
    expect(isExamDate('2026-02-30')).toBe(false);
    expect(dateOfDay(dayOfDate('2026-11-05'))).toBe('2026-11-05');
    expect(longDate('2026-11-05')).toBe('5 de noviembre');
    expect(shortDate('2026-11-05')).toBe('5 nov');
  });
});

describe('what is in an assessment', () => {
  it('counts what is left of what is turned on, without Extras', () => {
    const f = assessmentFacts(
      DECKS,
      plan(),
      [row(L1, { seen: 30, newSuspended: 5 }), row(OTHER_L, { seen: 3 })],
      ASSESSMENT,
    );
    expect(f).toMatchObject({ newLeft: 65, seen: 30, anyOn: true, unitsOff: 1 });
  });

  it('with Extras included, they count', () => {
    const p = plan({ assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }] });
    expect(assessmentFacts(DECKS, p, [], ASSESSMENT).newLeft).toBe(140);
  });

  it('nothing turned on', () => {
    const f = assessmentFacts(DECKS, plan({ activations: [] }), [], ASSESSMENT);
    expect(f).toMatchObject({ newLeft: 0, anyOn: false, unitsOff: 2 });
  });

  it('a lecture turned off with nothing new left is not material left out', () => {
    const p = plan({
      activations: [
        { deckId: L1, active: true },
        { deckId: L2, active: false },
      ],
    });
    const f = assessmentFacts(DECKS, p, [row(L2, { seen: 60 })], ASSESSMENT);
    expect(f.unitsOff).toBe(0);
  });

  it('cards an author took out do not count against the others', () => {
    expect(assessmentFacts(DECKS, plan(), [row(L1, { seen: 999 })], ASSESSMENT).newLeft).toBe(0);
  });

  it('a course that goes by weeks says so', () => {
    const weeks = [
      { id: ASSESSMENT, name: 'R::S::C::A', ownCards: 0 },
      { id: L1, name: 'R::S::C::A::S3 - Columna', ownCards: 10 },
    ];
    expect(assessmentFacts(weeks, plan(), [], ASSESSMENT).unitIsWeek).toBe(true);
  });
});

describe('the new cards a day', () => {
  it('without a date, the student’s number', () => {
    expect(computePace(undefined, facts(), TODAY, 15)).toEqual({
      kind: 'none',
      newPerDay: 15,
      daysLeft: null,
    });
    expect(computePace({ examDate: null }, facts(), TODAY, 15).kind).toBe('none');
  });

  it('what is left ÷ the days left minus the final review, rounded up', () => {
    // 12 days, 3 of review: 9 days. 100 / 9 = 11.1.
    expect(computePace({ examDate: inDays(12) }, facts(), TODAY, 15)).toEqual({
      kind: 'computed',
      newPerDay: 12,
      daysLeft: 12,
    });
    expect(
      computePace({ examDate: inDays(12), finalReviewDays: 1 }, facts(), TODAY, 15).newPerDay,
    ).toBe(10);
    expect(
      computePace({ examDate: inDays(12), finalReviewDays: 7 }, facts(), TODAY, 15).newPerDay,
    ).toBe(20);
  });

  it('does not change while studying: what was answered today moves from one side to the other', () => {
    const before = computePace({ examDate: inDays(12) }, facts(), TODAY, 15);
    for (let answered = 1; answered <= 12; answered++) {
      const during = facts({ newLeft: 100 - answered, newToday: answered });
      expect(newAtDayStart(during)).toBe(100);
      expect(computePace({ examDate: inDays(12) }, during, TODAY, 15)).toEqual(before);
    }
  });

  it('the next day it is computed again, from what is left', () => {
    const tomorrow = facts({ newLeft: 88, newToday: 0, newYesterday: 12 });
    expect(computePace({ examDate: inDays(12) }, tomorrow, TODAY + 1, 15).newPerDay).toBe(11);
  });

  it('turning a lecture on recalculates it', () => {
    const setting = dated(12);
    const off = plan({ assessments: [setting] });
    const on = plan({
      assessments: [setting],
      activations: [
        { deckId: L1, active: true },
        { deckId: L2, active: true },
      ],
    });
    expect(assessmentPaces(DECKS, off, [], TODAY).get(ASSESSMENT)).toBe(12);
    expect(assessmentPaces(DECKS, on, [], TODAY).get(ASSESSMENT)).toBe(18);
  });

  it('a date that passed goes back to the student’s number, without an error', () => {
    expect(computePace({ examDate: inDays(-1) }, facts(), TODAY, 15)).toEqual({
      kind: 'past',
      newPerDay: 15,
      daysLeft: -1,
    });
  });

  it('the days of the final review give 0, up to the day of the test', () => {
    for (const days of [3, 2, 1, 0]) {
      expect(computePace({ examDate: inDays(days) }, facts(), TODAY, 15)).toMatchObject({
        kind: 'final-review',
        newPerDay: 0,
      });
    }
    expect(computePace({ examDate: inDays(4) }, facts(), TODAY, 15).kind).toBe('computed');
    expect(computePace({ examDate: inDays(1), finalReviewDays: 1 }, facts(), TODAY, 15).kind).toBe(
      'final-review',
    );
    expect(computePace({ examDate: inDays(2), finalReviewDays: 1 }, facts(), TODAY, 15).kind).toBe(
      'computed',
    );
  });

  it('with nothing turned on nothing is computed; with nothing new left, 0', () => {
    expect(
      computePace({ examDate: inDays(12) }, facts({ anyOn: false, newLeft: 0 }), TODAY, 15).kind,
    ).toBe('nothing-on');
    expect(computePace({ examDate: inDays(12) }, facts({ newLeft: 0 }), TODAY, 15)).toMatchObject({
      kind: 'finished',
      newPerDay: 0,
    });
  });

  it('only assessments with a date get a pace', () => {
    const p = plan({ assessments: [{ deckId: ASSESSMENT, includeExtras: false, newPerDay: 15 }] });
    expect(assessmentPaces(DECKS, p, [], TODAY).size).toBe(0);
  });
});

describe('the pace that rose', () => {
  const setting = { examDate: inDays(10), finalReviewDays: 3 };
  const pace = (f: AssessmentFacts) => computePace(setting, f, TODAY, 15);

  it('whoever did yesterday’s number is not told anything', () => {
    // Yesterday, 11 days left (8 of new cards) and 100 left: 13 a day. They did them.
    const f = facts({ newLeft: 87, newYesterday: 13 });
    expect(paceRose(pace(f), setting, f, TODAY - 5, TODAY)).toBe(false);
  });

  it('whoever left new cards undone is told', () => {
    const f = facts({ newLeft: 100, newYesterday: 0 });
    expect(pace(f).newPerDay).toBe(15);
    expect(paceRose(pace(f), setting, f, TODAY - 5, TODAY)).toBe(true);
  });

  it('on the day the date was put, nothing rose yet', () => {
    const f = facts({ newLeft: 100, newYesterday: 0 });
    expect(paceRose(pace(f), setting, f, TODAY, TODAY)).toBe(false);
    expect(paceRose(pace(f), setting, f, null, TODAY)).toBe(false);
  });
});

describe('the time it takes', () => {
  it('new cards take two answers and the reviews come on top, by the user’s time', () => {
    const base = { daysLeft: 30, finalDays: 3, seen: 0, medianAnswerMs: 15_000 };
    const few = planMinutes({ ...base, newPerDay: 10 });
    const many = planMinutes({ ...base, newPerDay: 100 });
    expect(many).toBeGreaterThan(few * 5);
    // 10 new a day: 20 answers (5 min) and about 12 of reviews.
    expect(few).toBeGreaterThanOrEqual(5);
    expect(few).toBeLessThanOrEqual(15);
    const slow = planMinutes({ ...base, newPerDay: 100, medianAnswerMs: 30_000 });
    expect(slow).toBeGreaterThan(many * 1.8);
  });

  it('what was already seen also comes back', () => {
    const base = { newPerDay: 0, daysLeft: 12, finalDays: 3, medianAnswerMs: null };
    expect(planMinutes({ ...base, seen: 0 })).toBe(0);
    expect(planMinutes({ ...base, seen: 600 })).toBeGreaterThan(0);
  });

  it('the last days do not say hours for a few reviews, nor jump from one day to the next', () => {
    // 1.200 cards seen: answering the real decks with the scheduler, these days take about 20 minutes (not 2 h 55 min).
    const minutes = [0, 1, 2, 3, 4, 5].map((daysLeft) =>
      planMinutes({ newPerDay: 0, daysLeft, finalDays: 3, seen: 1200, medianAnswerMs: null }),
    );
    for (const m of minutes) {
      expect(m).toBeGreaterThanOrEqual(15);
      expect(m).toBeLessThanOrEqual(30);
    }
    expect(new Set(minutes).size).toBe(1);
  });

  it('a plan of two weeks says about what it takes', () => {
    // 1.285 cards in 14 days (117 a day): the scheduler gives 59 minutes on the first two days and 88 from then on.
    const m = planMinutes({
      newPerDay: 117,
      daysLeft: 14,
      finalDays: 3,
      seen: 0,
      medianAnswerMs: null,
    });
    expect(m).toBeGreaterThanOrEqual(60);
    expect(m).toBeLessThanOrEqual(95);
  });

  it('a pace that is too much says the time and what can be done, and never that one will make it', () => {
    const p = plan({
      activations: [
        { deckId: L1, active: true },
        { deckId: L2, active: true },
      ],
      assessments: [dated(6, { examDateSetAt: null })],
    });
    const decks = DECKS.map((d) => (d.id === L1 ? { ...d, ownCards: 4000 } : d));
    const view = assessmentView({
      decks,
      plan: p,
      progress: [],
      assessmentId: ASSESSMENT,
      today: TODAY,
      prefs: defaultPreferences(),
    });
    expect(view.options.find((o) => o.finalDays === 3)!.minutes).toBeGreaterThan(
      UNREALISTIC_MINUTES,
    );
    expect(view.unrealistic).toBe(true);
    expect(view.status).toMatch(/~\d+ h.* al día: con menos tiempo no alcanzas a ver todo/);
    expect(view.status).toMatch(/apagar clases o extras, o elegir otra fecha/);
  });

  it('each choice says what it means, or nothing if there is nothing to compute', () => {
    const options = paceOptions({ examDate: inDays(12) }, facts(), TODAY, null);
    expect(options.map((o) => o.newPerDay)).toEqual([10, 12, 20]);
    expect(options.every((o) => (o.minutes ?? 0) > 0)).toBe(true);
    // The test is on day 12 and its last days are for reviewing: 1 leaves day 11, 3 leaves 9, 10 and 11, 7 leaves 5 to 11.
    expect(options.map((o) => o.lastNewDate)).toEqual([inDays(10), inDays(8), inDays(4)]);
    expect(paceOptions({ examDate: null }, facts(), TODAY, null).map((o) => o.newPerDay)).toEqual([
      null,
      null,
      null,
    ]);
    expect(
      paceOptions({ examDate: inDays(-2) }, facts(), TODAY, null).map((o) => o.minutes),
    ).toEqual([null, null, null]);
    // Already in those days: nothing new comes out, so it has no last day.
    const close = paceOptions({ examDate: inDays(5) }, facts(), TODAY, null);
    expect(close.map((o) => o.lastNewDate)).toEqual([inDays(3), inDays(1), null]);
    expect(close[2]!.newPerDay).toBe(0);
  });
});

describe('what the student reads', () => {
  const view = (p: StudyPlan, progress: DeckProgress[] = []) =>
    assessmentView({
      decks: DECKS,
      plan: p,
      progress,
      assessmentId: ASSESSMENT,
      today: TODAY,
      prefs: defaultPreferences(),
    });

  it('without a date', () => {
    const v = view(plan());
    expect(v.status).toBe('');
    expect(v.summary).toBeNull();
  });

  it('material turned off is said', () => {
    const v = view(plan({ assessments: [dated(12)] }));
    expect(v.status).toBe(
      'Faltan 12 días · quedan 100 nuevas en lo activado · 1 clase sin activar no cuenta.',
    );
  });

  it('nothing turned on: it says to turn something on', () => {
    expect(view(plan({ activations: [], assessments: [dated(12)] })).status).toMatch(
      /Activa una semana o clase/,
    );
  });

  it('a date that passed suggests the next one', () => {
    const v = view(plan({ assessments: [dated(-3)] }));
    expect(v.status).toMatch(/ya pasó.*próxima prueba/);
    expect(v.summary).toBeNull();
    expect(v.reviewDays).toBe(false);
  });

  it('the days of the final review say so, and the review stands out', () => {
    const v = view(plan({ assessments: [dated(2)] }));
    expect(v.status).toMatch(/días de repaso final, sin tarjetas nuevas/);
    expect(v.status).toMatch(
      /Quedan 100 nuevas sin ver: si dejas menos días para repasar, siguen saliendo\./,
    );
    expect(v.reviewDays).toBe(true);
    expect(view(plan({ assessments: [dated(4)] })).reviewDays).toBe(false);
  });

  it('nothing it says is longer than the place it has', () => {
    for (const days of [-1, 0, 2, 12, 400]) {
      const assessments = [dated(days, { examDateSetAt: '2020-01-01T00:00:00Z' })];
      expect(view(plan({ assessments })).status.length).toBeLessThanOrEqual(LONGEST_STATUS.length);
    }
    expect(catchUpText({ overdue: 300, perDay: 60, days: 5 }).length).toBeLessThanOrEqual(
      LONGEST_CATCH_UP.length,
    );
  });

  it('«vas al día» only if it is true of the new cards too', () => {
    const on2 = {
      activations: [
        { deckId: L1, active: true },
        { deckId: L2, active: true },
      ],
    };
    const summary = (p: Partial<StudyPlan>, progress: DeckProgress[] = []) =>
      view(plan(p), progress).summary;
    const since = { examDateSetAt: '2020-01-01T00:00:00Z' };
    // 160 cards: 12 a day from yesterday, with 13 days of new cards from today.
    expect(
      summary({ ...on2, assessments: [dated(16, since)] }, [
        row(L1, { seen: 12, newYesterday: 12 }),
      ]),
    ).toBe('Faltan 16 días · vas al día');
    // Nothing late, because nothing was studied: 13 a day now.
    expect(summary({ ...on2, assessments: [dated(16, since)] })).toBe(
      'Faltan 16 días · ahora 13 nuevas al día',
    );
    expect(summary({ activations: [], assessments: [dated(16)] })).toBe(
      'Faltan 16 días · nada activado',
    );
    expect(summary({ assessments: [dated(2)] })).toBe('Faltan 2 días · repaso final');
    // Late reviews say more than any of those.
    expect(summary({ assessments: [dated(2)] }, [row(L1, { seen: 5, overdue: 4 })])).toBe(
      'Faltan 2 días · 4 atrasadas',
    );
  });

  it('the pace cannot be reached today: it says so, and nobody left anything undone', () => {
    const on2 = {
      activations: [
        { deckId: L1, active: true },
        { deckId: L2, active: true },
      ],
    };
    const p = plan({ ...on2, assessments: [dated(6, { examDateSetAt: '2020-01-01T00:00:00Z' })] });
    // 155 cards over 3 days, 52 a day; yesterday's 5 are not what the pace asked for.
    const v = assessmentView({
      decks: DECKS,
      plan: p,
      progress: [row(L1, { seen: 5, newYesterday: 5 })],
      assessmentId: ASSESSMENT,
      today: TODAY,
      prefs: defaultPreferences(),
    });
    expect(v.rose).toBe(true);
    expect(v.status).toContain('Para llegar a la fecha, ahora son 52 al día.');
    expect(v.status).not.toContain('misma nota');
    expect(v.options.find((o) => o.finalDays === 3)!.newPerDay).toBe(52);
  });

  it('knows the last day with new cards', () => {
    expect(view(plan({ assessments: [dated(4)] })).lastNewDay).toBe(true);
    expect(view(plan({ assessments: [dated(5)] })).lastNewDay).toBe(false);
  });

  it('the summary: going fine or behind', () => {
    expect(examSummary(12, 0)).toBe('Faltan 12 días · vas al día');
    expect(examSummary(12, 40)).toBe('Faltan 12 días · 40 atrasadas');
    expect(examSummary(1, 1)).toBe('Falta 1 día · 1 atrasada');
    expect(examSummary(0, 0)).toBe('Hoy es la prueba · vas al día');
    expect(examSummary(null, 0)).toBeNull();
    expect(examSummary(-1, 0)).toBeNull();
  });

  it('a course: the nearest test ahead', () => {
    const p = plan({
      assessments: [dated(30), { ...dated(9), deckId: OTHER }, { ...dated(-2), deckId: '7' }],
    });
    expect(
      nearestExamText(
        DECKS,
        p,
        [row(OTHER_L, { overdue: 3 })],
        [ASSESSMENT, OTHER, '7'],
        TODAY,
        defaultPreferences(),
      ),
    ).toBe('B · Faltan 9 días · 3 atrasadas');
    expect(
      nearestExamText(DECKS, plan(), [], [ASSESSMENT], TODAY, defaultPreferences()),
    ).toBeNull();
  });
});

describe('catching up', () => {
  it('a small backlog needs no plan', () => {
    expect(catchUpPlan(LARGE_BACKLOG - 1, null)).toBeNull();
    expect(catchUpPlan(LARGE_BACKLOG, null)).not.toBeNull();
  });

  it('as the example: 300 late, 60 a day, 5 days', () => {
    const plan = catchUpPlan(300, null)!;
    expect(plan).toEqual({ overdue: 300, perDay: 60, days: 5 });
    expect(catchUpText(plan)).toBe(
      'Llevas 300 atrasadas. Con ~60 al día, además de lo de hoy, te pones al día en 5 días.',
    );
  });

  it('a very large one takes more days, not more than 100 a day', () => {
    expect(catchUpPlan(1000, null)).toEqual({ overdue: 1000, perDay: 100, days: 10 });
  });

  it('the test comes first: over the days left', () => {
    expect(catchUpPlan(300, 2)).toEqual({ overdue: 300, perDay: 150, days: 2 });
    expect(catchUpText(catchUpPlan(100, 1)!)).toMatch(/en 1 día\.$/);
    // On the day of the test itself a plan would end after it.
    expect(catchUpPlan(300, 0)).toBeNull();
  });

  it('the numbers always reach', () => {
    for (const overdue of [50, 51, 317, 999, 5000]) {
      const p = catchUpPlan(overdue, null)!;
      expect(p.perDay * p.days).toBeGreaterThanOrEqual(overdue);
    }
  });
});

describe('a new day with a session open', () => {
  it('what was answered stops being new, and only then', () => {
    const answers = [
      { deckId: L1, queueBefore: 'new' },
      { deckId: L1, queueBefore: 'new' },
      { deckId: L1, queueBefore: 'review' },
      { deckId: L2, queueBefore: 'new' },
    ];
    const before = [row(L1, { seen: 10, newToday: 1, newYesterday: 7 })];
    const after = rollProgress(before, answers);
    // One of the two was answered before the session: it is already in `seen`.
    expect(after.find((p) => p.deckId === L1)).toMatchObject({
      seen: 11,
      newToday: 0,
      newYesterday: 2,
    });
    expect(after.find((p) => p.deckId === L2)).toMatchObject({ seen: 1, newYesterday: 1 });
  });
});
