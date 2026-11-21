// Tests for the reasons an administrator sees what a student does not: the draft, a hidden semester, a course turned off.
import { describe, expect, it } from 'vitest';
import { adminKey, markAdminOnly } from '../admin-only';
import type { Catalog } from '../api';

const note = (id: string, course: string) => ({
  id,
  slug: id.toLowerCase(),
  courseId: course,
  assessmentId: `${course}/c1`,
  kind: 'lecture' as const,
  title: 'X',
  position: 1,
  updatedAt: '2026-11-07T12:00:00.000Z',
});

const course = (id: string, notes: string[], cards = 0) => ({
  id,
  semester: 1,
  name: id,
  emoji: '📘',
  position: 1,
  assessments: [
    {
      id: `${id}/c1`,
      courseId: id,
      name: 'C1',
      position: 1,
      cardCount: cards,
      quizzes: [],
      notes: notes.map((n) => note(n, id)),
    },
  ],
});

const deck = (id: string, courseId: string | null, cards: number, semester = 1) => ({
  id,
  name: id,
  parentId: null,
  preset: null,
  semester,
  courseId,
  assessmentId: null,
  noteCount: cards,
  cardCount: cards,
});

const catalog = (
  semesters: { number: number; courses: ReturnType<typeof course>[] }[],
  decks: ReturnType<typeof deck>[] = [],
): Catalog => ({
  semesters: semesters.map((s) => ({ number: s.number, name: `${s.number}°`, courses: s.courses })),
  anki: { decks, presets: [], noteTypes: [] },
});

const OPEN = { hideEmptySemesters: false, hiddenCourses: [] };

describe('markAdminOnly', () => {
  it('marks nothing when the draft is what is published', () => {
    const c = catalog([{ number: 1, courses: [course('a', ['n1'], 2)] }], [deck('d1', 'a', 2)]);
    expect(markAdminOnly(c, c, OPEN)).toEqual({ ...c, adminOnly: {} });
  });

  it('marks as draft what the published catalog does not have, and only that', () => {
    const published = catalog([{ number: 1, courses: [course('a', ['n1']), course('b', [])] }]);
    const draft = catalog(
      [{ number: 1, courses: [course('a', ['n1', 'n2']), course('b', ['n3'])] }],
      [deck('d1', 'b', 3)],
    );
    expect(markAdminOnly(draft, published, OPEN).adminOnly).toEqual({
      [adminKey('note', 'n2')]: ['draft'],
      [adminKey('note', 'n3')]: ['draft'],
      [adminKey('course', 'b')]: ['draft'],
      [adminKey('assessment', 'b/c1')]: ['draft'],
      [adminKey('deck', 'd1')]: ['draft'],
    });
  });

  it('marks a course turned off and all that it holds', () => {
    const c = catalog([{ number: 1, courses: [course('a', ['n1']), course('b', ['n2'], 4)] }], [
      deck('d1', 'b', 4),
      deck('d2', 'a', 1),
    ]);
    const marks = markAdminOnly(c, c, { ...OPEN, hiddenCourses: ['b'] }).adminOnly;
    expect(marks).toEqual({
      [adminKey('course', 'b')]: ['hiddenCourse'],
      [adminKey('assessment', 'b/c1')]: ['hiddenCourse'],
      [adminKey('note', 'n2')]: ['hiddenCourse'],
      [adminKey('deck', 'd1')]: ['hiddenCourse'],
    });
  });

  it('marks a semester a student would not see, and what is in it, with every reason that applies', () => {
    const published = catalog([
      { number: 1, courses: [course('a', ['n1'])] },
      { number: 2, courses: [course('e', [])] },
      { number: 3, courses: [course('f', ['n9'])] },
    ]);
    const draft = catalog([
      { number: 1, courses: [course('a', ['n1'])] },
      { number: 2, courses: [course('e', ['n5'])] },
      { number: 3, courses: [course('f', ['n9'])] },
    ]);
    const marks = markAdminOnly(draft, published, {
      hideEmptySemesters: true,
      hiddenCourses: ['f'],
    }).adminOnly;
    expect(marks).toEqual({
      [adminKey('semester', 2)]: ['hiddenSemester'],
      [adminKey('course', 'e')]: ['draft', 'hiddenSemester'],
      [adminKey('assessment', 'e/c1')]: ['draft', 'hiddenSemester'],
      [adminKey('note', 'n5')]: ['draft', 'hiddenSemester'],
      [adminKey('semester', 3)]: ['hiddenSemester'],
      [adminKey('course', 'f')]: ['hiddenSemester', 'hiddenCourse'],
      [adminKey('assessment', 'f/c1')]: ['hiddenSemester', 'hiddenCourse'],
      [adminKey('note', 'n9')]: ['hiddenSemester', 'hiddenCourse'],
    });
  });

  it('keeps every semester when empty ones are not hidden', () => {
    const c = catalog([{ number: 2, courses: [course('e', [])] }]);
    expect(markAdminOnly(c, c, OPEN).adminOnly).toEqual({});
  });
});
