// Tests for the catalog without the courses turned off, and the panel's list of courses.
import { describe, expect, it } from 'vitest';
import { siteSemesters, withoutCourses } from '../visibility';
import type { Catalog } from '../api';

const course = (id: string, semester: number, notes: number, cards: number) => ({
  id,
  semester,
  name: id.toUpperCase(),
  emoji: '📘',
  position: 1,
  assessments: [
    {
      id: `${id}/certamen-1`,
      courseId: id,
      name: 'Certamen 1',
      position: 1,
      cardCount: cards,
      quizzes: [],
      notes: Array.from({ length: notes }, (_, i) => ({
        id: `AP-${id}-${i}`,
        slug: `${id}-${i}`,
        courseId: id,
        assessmentId: `${id}/certamen-1`,
        kind: 'lecture' as const,
        title: 'X',
        position: i,
        updatedAt: '2026-11-07T12:00:00.000Z',
      })),
    },
  ],
});

const deck = (id: string, parentId: string | null, courseId: string | null, cards: number) => ({
  id,
  name: id,
  parentId,
  preset: null,
  semester: 2,
  courseId,
  assessmentId: null,
  noteCount: cards,
  cardCount: cards,
});

const catalog: Catalog = {
  semesters: [
    { number: 1, name: '1° Semestre', courses: [course('a', 1, 2, 0)] },
    { number: 2, name: '2° Semestre', courses: [course('b', 2, 1, 5), course('c', 2, 0, 0)] },
  ],
  anki: {
    decks: [
      deck('1', null, null, 12),
      deck('2', '1', null, 12),
      deck('10', '2', 'b', 5),
      deck('11', '10', 'b', 3),
      deck('20', '2', 'e', 7),
    ],
    presets: [],
    noteTypes: [],
  },
};

describe('the catalog without courses', () => {
  it('with none turned off, the same catalog', () => {
    expect(withoutCourses(catalog, new Set())).toBe(catalog);
  });

  it('takes out the course, its decks below, and its cards from the decks above', () => {
    const out = withoutCourses(catalog, new Set(['b']));
    expect(out.semesters.flatMap((s) => s.courses.map((c) => c.id))).toEqual(['a', 'c']);
    expect(out.anki.decks.map((d) => [d.id, d.cardCount])).toEqual([
      ['1', 7],
      ['2', 7],
      ['20', 7],
    ]);
    expect(out.hiddenSemesters).toBeUndefined();
  });

  it('counts a course once however many decks it has, and never goes below zero', () => {
    const out = withoutCourses(catalog, new Set(['b', 'e']));
    expect(out.anki.decks.map((d) => [d.id, d.cardCount, d.noteCount])).toEqual([
      ['1', 0, 0],
      ['2', 0, 0],
    ]);
  });
});

describe('the panel’s list of courses', () => {
  it('has the courses with material, by semester, with what each one holds', () => {
    expect(siteSemesters(catalog, new Set())).toEqual([
      {
        number: 1,
        name: '1° Semestre',
        courses: [{ id: 'a', name: 'A', emoji: '📘', notes: 2, quizzes: 0, cards: 0 }],
      },
      {
        number: 2,
        name: '2° Semestre',
        courses: [{ id: 'b', name: 'B', emoji: '📘', notes: 1, quizzes: 0, cards: 5 }],
      },
    ]);
  });

  it('keeps a course that is off, with or without material, so it can be turned on', () => {
    const list = siteSemesters(catalog, new Set(['c']));
    expect(list[1]!.courses.map((c) => c.id)).toEqual(['b', 'c']);
  });
});
