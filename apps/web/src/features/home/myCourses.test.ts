import { describe, expect, it } from 'vitest';
import type { Catalog, CourseWithAssessments } from '@qv/schema';
import { MAX_CHOSEN_COURSES, addCourse, listText, myCourses, removeCourse } from './myCourses';

/**
 * «Tus ramos» (step 3.2, the owner's decisions of the review): the semester ∪ the added ∪ those with something on or
 * studied − those taken out, in the catalog's order; the courses without material go apart («Próximamente»).
 */

/** A course with a note (material) or without anything. */
function course(id: string, semester: number, material: boolean): CourseWithAssessments {
  return {
    id,
    semester,
    name: id,
    emoji: '📘',
    assessments: material ? [{ notes: [{}], quizzes: [] }] : [],
  } as unknown as CourseWithAssessments;
}

const CATALOG = {
  semesters: [
    { number: 1, name: '1° Semestre', courses: [course('a1', 1, true), course('q1', 1, false)] },
    {
      number: 2,
      name: '2° Semestre',
      courses: [course('a2', 2, true), course('b2', 2, true), course('f2', 2, false)],
    },
    { number: 3, name: '3° Semestre', courses: [course('c3', 3, true)] },
  ],
  anki: { decks: [], presets: [], noteTypes: [] },
} as unknown as Catalog;

const none = { semester: null, addedCourses: [], removedCourses: [] };
const ids = (xs: CourseWithAssessments[]) => xs.map((c) => c.id);

describe('«Tus ramos»', () => {
  it('nothing chosen and nothing on: empty, and every course with material can be added', () => {
    const r = myCourses(CATALOG, none, new Set());
    expect(ids(r.cards)).toEqual([]);
    expect(ids(r.soon)).toEqual([]);
    expect(ids(r.addable)).toEqual(['a1', 'a2', 'b2', 'c3']);
  });

  it('the semester: its courses with material as cards, the others in one line', () => {
    const r = myCourses(CATALOG, { ...none, semester: 2 }, new Set());
    expect(ids(r.cards)).toEqual(['a2', 'b2']);
    expect(ids(r.soon)).toEqual(['f2']);
    expect(ids(r.addable)).toEqual(['a1', 'c3']);
  });

  it('semester ∪ added ∪ with something on − taken out; the added ones last, in the order they were added', () => {
    const r = myCourses(
      CATALOG,
      { semester: 2, addedCourses: ['c3'], removedCourses: ['b2'] },
      new Set(['a1']),
    );
    expect(ids(r.cards)).toEqual(['a1', 'a2', 'c3']);
    expect(ids(r.addable)).toEqual(['b2']);
  });

  it('a course taken out stays out even with something on (only «Hoy» still shows it)', () => {
    const r = myCourses(CATALOG, { ...none, removedCourses: ['a1'] }, new Set(['a1']));
    expect(ids(r.cards)).toEqual([]);
    expect(ids(r.addable)).toContain('a1');
  });

  it('an id that is not in the catalog is left out', () => {
    const r = myCourses(CATALOG, { ...none, addedCourses: ['ramo-que-no-existe'] }, new Set());
    expect(ids(r.cards)).toEqual([]);
  });

  it('adding brings back what was taken out; taking out undoes what was added', () => {
    const removed = removeCourse({ ...none, semester: 2, addedCourses: ['c3'] }, 'c3');
    expect(removed).toEqual({ semester: 2, addedCourses: [], removedCourses: ['c3'] });
    const back = addCourse(removed, 'c3');
    expect(back).toEqual({ semester: 2, addedCourses: ['c3'], removedCourses: [] });
    expect(ids(myCourses(CATALOG, back, new Set()).cards)).toEqual(['a2', 'b2', 'c3']);
    // A course of the semester taken out and added again: it shows again, last (nothing above it moves).
    const semester = addCourse(removeCourse({ ...none, semester: 2 }, 'a2'), 'a2');
    expect(ids(myCourses(CATALOG, semester, new Set()).cards)).toEqual(['b2', 'a2']);
    // Added in this order, they stay in this order, after the semester's.
    const two = addCourse(addCourse({ ...none, semester: 2 }, 'c3'), 'a1');
    expect(ids(myCourses(CATALOG, two, new Set()).cards)).toEqual(['a2', 'b2', 'c3', 'a1']);
  });

  it('no repeated ids, and never more than the database keeps', () => {
    let p = { ...none };
    for (let i = 0; i < MAX_CHOSEN_COURSES + 20; i++)
      p = removeCourse(addCourse(p, `r${i}`), `r${i}`);
    expect(p.removedCourses).toHaveLength(MAX_CHOSEN_COURSES);
    expect(new Set(p.removedCourses).size).toBe(MAX_CHOSEN_COURSES);
    expect(addCourse(addCourse(none, 'a1'), 'a1').addedCourses).toEqual(['a1']);
  });

  it('«Próximamente: A, B y C», with «e» before an «i» sound', () => {
    expect(listText(['Química', 'Matemáticas', 'Anatomía I'])).toBe(
      'Química, Matemáticas y Anatomía I',
    );
    expect(listText(['Matemáticas', 'Introducción a la profesión médica'])).toBe(
      'Matemáticas e Introducción a la profesión médica',
    );
    expect(listText(['Anatomía II', 'Histología y embriología'])).toBe(
      'Anatomía II e Histología y embriología',
    );
    expect(listText(['Física'])).toBe('Física');
  });
});
