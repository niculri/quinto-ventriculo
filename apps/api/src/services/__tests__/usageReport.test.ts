// Tests for the pieces of the usage report: the site's day, the groups of the users' database and the opens' figures.
import { describe, expect, it } from 'vitest';
import { FEW, SEARCH_CONTEXTS } from '@qv/schema';
import type { AdminUsageRow } from '@qv/schema';
import { CATALOG, row } from '../../test/usageApp';
import type { OpenCounts } from '../../ports/usage';
import { opensFigures, siteDay, usageGroups, usageReport } from '../usageReport';

describe('the usage report', () => {
  it('the site’s day starts at 4:00 in Santiago', () => {
    // 2026-11-09 06:59 UTC = 03:59 in Santiago (summer, -3): still the 8th.
    expect(siteDay(Date.parse('2026-11-09T06:59:00Z'))).toBe('2026-11-08');
    expect(siteDay(Date.parse('2026-11-09T07:00:00Z'))).toBe('2026-11-09');
  });

  it('the groups leave out what is not in a course, and a test with an id the database would refuse', () => {
    const catalog = structuredClone(CATALOG);
    catalog.semesters[0]!.courses[0]!.assessments[0]!.quizzes.push({
      ...catalog.semesters[0]!.courses[0]!.assessments[0]!.quizzes[0]!,
      id: 'Mal_Id',
    });
    expect(Object.keys(usageGroups(catalog).quizzes)).toEqual(['test-de-prueba']);
    expect(Object.keys(usageGroups(catalog).decks)).toEqual(['3', '4', '5', '6']);
  });

  it('with 1 student active in the 30 days, the most opened and the searches are listed', () => {
    const r = row();
    r.totals.last_30.active_students = 1;
    const opens = opensFigures(
      {
        hourly: [],
        items: [{ kind: 'note', path: '/api/notes/apunte', count: 1 }],
        searches: [{ context: 'note', count: 2 }],
      },
      r,
    );
    expect(opens.top).toEqual([{ kind: 'note', id: 'apunte', opens: 1 }]);
    expect(opens.searches).toEqual([{ context: 'note', count: 2 }]);
  });
});

const EMPTY_COUNTS: OpenCounts = { hourly: [], items: [], searches: [] };
const withItems = (...items: OpenCounts['items']): OpenCounts => ({ ...EMPTY_COUNTS, items });
const item = (kind: 'note' | 'deck' | 'quiz', path: string, count: number) => ({
  kind,
  path,
  count,
});

describe('the unit of a deck', () => {
  const deck = (id: string, name: string, courseId: string | null = 'c') => ({
    id,
    name,
    parentId: null,
    preset: null,
    semester: 2,
    courseId,
    assessmentId: courseId ? 'c/a' : null,
    noteCount: 0,
    cardCount: 0,
  });
  const groupsOf = (...decks: ReturnType<typeof deck>[]) => {
    const catalog = structuredClone(CATALOG);
    catalog.anki.decks = decks;
    return usageGroups(catalog).decks;
  };

  it('is the deck of the fifth level of its name, and a deck above that has none', () => {
    const unit = 'R::2° Semestre::Ramo::Certamen 1::01 - Clase';
    const groups = groupsOf(
      deck('5', unit),
      deck('6', `${unit}::Extras::Hondo`),
      deck('4', 'R::2° Semestre::Ramo::Certamen 1'),
    );
    expect(groups['5']![0]).toBe('5');
    expect(groups['6']![0]).toBe('5');
    expect(groups['4']![0]).toBeNull();
  });

  it('a unit that is not in the catalog is none, rather than a made-up id', () => {
    const groups = groupsOf(deck('9', 'R::2° Semestre::Ramo::Certamen 1::01 - Clase::Sub'));
    expect(groups['9']![0]).toBeNull();
  });

  it('a deck whose id is not digits is not asked for', () => {
    expect(
      Object.keys(groupsOf(deck('abc', 'R::S::A::C::U'), deck('7', 'R::S::A::C::U2'))),
    ).toEqual(['7']);
  });
});

describe('what the opens list shows', () => {
  const raw = () => row();

  it('whatever was opened once or more, most opened first, ties by id, at most 15', () => {
    const items = [
      item('note', '/api/notes/zeta', 7),
      item('note', '/api/notes/alfa', 7),
      item('deck', '/api/decks/12', 9),
      item('quiz', '/api/quizzes/un-test', 5),
      item('note', '/api/notes/pocas', 4),
    ];
    expect(opensFigures(withItems(...items), raw()).top).toEqual([
      { kind: 'deck', id: '12', opens: 9 },
      { kind: 'note', id: 'alfa', opens: 7 },
      { kind: 'note', id: 'zeta', opens: 7 },
      { kind: 'quiz', id: 'un-test', opens: 5 },
      { kind: 'note', id: 'pocas', opens: 4 },
    ]);
    const many = Array.from({ length: 20 }, (_, i) => item('note', `/api/notes/n${i}`, 10 + i));
    const top = opensFigures(withItems(...many), raw()).top;
    expect(top).toHaveLength(15);
    expect(top[0]!.opens).toBe(29);
  });

  it('a path that is not of its kind, with an odd id or badly encoded, is not listed', () => {
    const top = opensFigures(
      withItems(
        item('note', '/api/decks/12', 9),
        item('deck', '/api/decks/abc', 9),
        item('quiz', '/api/quizzes/Mayus', 9),
        item('note', '/api/notes/%E0%A4%A', 9),
        item('note', '/api/notes/%61punte', 9),
      ),
      raw(),
    ).top;
    expect(top).toEqual([{ kind: 'note', id: 'apunte', opens: 9 }]);
  });

  it('searches are summed by kind of page in the order of the panel, and one without it counts as «other»', () => {
    const { searches } = opensFigures(
      {
        ...EMPTY_COUNTS,
        searches: [
          { context: '', count: 3 },
          { context: 'other', count: 2 },
          { context: 'home', count: 12 },
          { context: 'home', count: 1 },
          { context: 'note', count: 0 },
        ],
      },
      raw(),
    );
    expect(searches.map((s) => s.context)).toEqual(
      SEARCH_CONTEXTS.filter((c) => c === 'home' || c === 'other'),
    );
    expect(searches.find((s) => s.context === 'home')!.count).toBe(13);
    expect(searches.find((s) => s.context === 'other')!.count).toBe(5);
  });
});

describe('the opens of each day', () => {
  const at = (r: AdminUsageRow, back: number) => `${r.days.at(-1 - back)!.day}T15:00:00Z`;

  it('a day shows its counts exact, whoever was active, and none as zero', () => {
    const r = row();
    r.days.at(-1)!.active_students = 1;
    const hourly: OpenCounts['hourly'] = [
      { hour: at(r, 0), kind: 'note', count: 6 },
      { hour: at(r, 0), kind: 'deck', count: 2 },
      { hour: at(r, 0), kind: 'quiz', count: 5 },
    ];
    const today = opensFigures({ ...EMPTY_COUNTS, hourly }, r).days.at(-1)!;
    expect(today).toMatchObject({ notes: 6, decks: 2, quizzes: 5, searches: 0 });
  });

  it('a day with opens and a «<5» of an older database still shows them; without opens, zeros', () => {
    const r = row();
    r.days.at(-2)!.active_students = FEW;
    const hourly: OpenCounts['hourly'] = [{ hour: at(r, 1), kind: 'note', count: 3 }];
    const { days } = opensFigures({ ...EMPTY_COUNTS, hourly }, r);
    expect(days.at(-2)).toMatchObject({ notes: 3, decks: 0, quizzes: 0, searches: 0 });
    expect(days.at(-3)).toMatchObject({ notes: 0, decks: 0, quizzes: 0, searches: 0 });
  });

  it('the last 7 days are the last 7 of the report, and the 30 are all of them', () => {
    const r = row();
    const hourly: OpenCounts['hourly'] = [
      { hour: at(r, 6), kind: 'note', count: 10 },
      { hour: at(r, 7), kind: 'note', count: 100 },
    ];
    const { totals } = opensFigures({ ...EMPTY_COUNTS, hourly }, r);
    expect(totals.last7.notes).toBe(10);
    expect(totals.last30.notes).toBe(110);
  });
});

describe('usageReport', () => {
  const stats = (): AdminUsageRow => ({
    ...row({ decks: {}, quizzes: {} }),
    quizzes: [{ quiz_id: 'q', students: 6, rounds_started: 7, rounds_finished: FEW }],
    courses: [
      {
        course_id: 'c',
        students: 6,
        anki_answers: 100,
        new_cards: FEW,
        rounds_started: 3,
        rounds_finished: 2,
      },
    ],
    assessments: [
      {
        assessment_id: 'c/a',
        course_id: 'c',
        students: 5,
        anki_answers: 90,
        new_cards: 8,
        rounds_started: 1,
        rounds_finished: 0,
      },
    ],
  });

  it('renames each figure of the database, keeping what each group is about (a «<5» of an older one too)', () => {
    const r = usageReport(stats(), { status: 'not_configured' });
    expect(r.quizzes).toEqual([
      { quizId: 'q', students: 6, roundsStarted: 7, roundsFinished: FEW },
    ]);
    expect(r.courses[0]).toMatchObject({ courseId: 'c', ankiAnswers: 100, newCards: FEW });
    expect(r.assessments[0]).toMatchObject({
      assessmentId: 'c/a',
      courseId: 'c',
      roundsStarted: 1,
    });
    expect(r.totals.today.activeStudents).toBe(6);
    expect(r.invited).toEqual({ signedIn: 7, never: 2 });
  });

  it('the opens are there only when they could be read, and the status says why not', () => {
    const none = usageReport(stats(), { status: 'unavailable' });
    expect([none.opens, none.opensStatus]).toEqual([null, 'unavailable']);
    const some = usageReport(stats(), { status: 'ok', counts: EMPTY_COUNTS });
    expect(some.opens).not.toBeNull();
    expect(some.opensStatus).toBe('ok');
  });

  it('the errors of the browsers go as they are, or null when nobody read them', () => {
    expect(usageReport(stats(), { status: 'unavailable' }).clientErrors).toBeNull();
    const errors = [
      {
        kind: 'chunk' as const,
        page: '/',
        message: 'm',
        version: 'v',
        count: 2,
        lastSeen: '2026-11-19T12:00:00.000Z',
      },
    ];
    expect(
      usageReport(stats(), { status: 'unavailable' }, { clientErrors: errors }).clientErrors,
    ).toEqual(errors);
  });

  it('the Worker requests go as they are, or null when nobody read them', () => {
    expect(usageReport(stats(), { status: 'unavailable' }).workerRequests).toBeNull();
    const days = [{ day: '2026-11-23', requests: 4210 }];
    expect(
      usageReport(stats(), { status: 'unavailable' }, { workerRequests: days }).workerRequests,
    ).toEqual(days);
  });

  it('exact figures of 1 to 4 students and lists of 1 student go as they are', () => {
    const exact: AdminUsageRow = {
      ...stats(),
      quizzes: [{ quiz_id: 'q', students: 1, rounds_started: 1, rounds_finished: 0 }],
      invited: { signed_in: 3, never: 1 },
      activation: { eligible: 2, activated: 1, not_activated: 1, percent: 50 },
    };
    const r = usageReport(exact, { status: 'not_configured' });
    expect(r.quizzes).toEqual([{ quizId: 'q', students: 1, roundsStarted: 1, roundsFinished: 0 }]);
    expect(r.invited).toEqual({ signedIn: 3, never: 1 });
    expect(r.activation).toEqual({ eligible: 2, activated: 1, notActivated: 1, percent: 50 });
    expect(r).not.toHaveProperty('minStudents');
  });

  it('an answer of the database that is not a usage row is an error, not a report with holes', () => {
    expect(() => usageReport({ today: 3 }, { status: 'unavailable' })).toThrow();
  });
});
