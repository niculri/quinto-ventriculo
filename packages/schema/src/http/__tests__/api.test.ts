// Tests for hiding the semesters without material from the catalog.
import { describe, expect, it } from 'vitest';
import {
  SiteSettingsUpdate,
  assessmentHasMaterial,
  courseHasMaterial,
  semesterHasMaterial,
  withoutEmptySemesters,
} from '../api';
import type { Catalog } from '../api';

const course = (id: string, semester: number, material: 'note' | 'quiz' | null) => ({
  id,
  semester,
  name: id,
  emoji: '📘',
  position: 1,
  assessments: [
    {
      id: `${id}/certamen-1`,
      courseId: id,
      name: 'Certamen 1',
      position: 1,
      cardCount: 0,
      notes:
        material === 'note'
          ? [
              {
                id: 'AP-X-C1-01',
                slug: 'x',
                courseId: id,
                assessmentId: `${id}/certamen-1`,
                kind: 'lecture' as const,
                title: 'X',
                position: 1,
                updatedAt: '2026-11-07T12:00:00.000Z',
              },
            ]
          : [],
      quizzes:
        material === 'quiz'
          ? [
              {
                id: 'q',
                slug: 'q',
                courseId: id,
                assessmentId: `${id}/certamen-1`,
                title: 'Q',
                position: 1,
                questionCount: 3,
                sectionCount: 1,
                updatedAt: '2026-11-07T12:00:00.000Z',
              },
            ]
          : [],
    },
  ],
});

const deck = (id: string, semester: number | null, cardCount: number) => ({
  id,
  name: id,
  parentId: null,
  preset: null,
  semester,
  courseId: null,
  assessmentId: null,
  noteCount: cardCount,
  cardCount,
});

const catalog: Catalog = {
  semesters: [
    { number: 1, name: '1° Semestre', courses: [course('a', 1, 'note')] },
    { number: 2, name: '2° Semestre', courses: [course('b', 2, 'quiz')] },
    { number: 3, name: '3° Semestre', courses: [course('c', 3, null)] },
    { number: 4, name: '4° Semestre', courses: [course('d', 4, null)] },
    { number: 5, name: '5° Semestre', courses: [] },
  ],
  anki: {
    decks: [deck('root', null, 5), deck('s3', 3, 0), deck('s4', 4, 5)],
    presets: [],
    noteTypes: [],
  },
};

describe('the semesters without material', () => {
  it('an article, a test or a deck with cards is material; a course or an empty deck is not', () => {
    expect(catalog.semesters.map((s) => semesterHasMaterial(catalog, s))).toEqual([
      true,
      true,
      false,
      true,
      false,
    ]);
  });

  it('a course or an assessment has material with an article, a test or a deck with cards of its own', () => {
    const courses = catalog.semesters.map((s) => s.courses[0]);
    const decks = [
      { ...deck('d-c', 3, 4), courseId: 'c', assessmentId: 'c/certamen-1' },
      { ...deck('d-d', 4, 0), courseId: 'd', assessmentId: null },
    ];
    const withDecks = { ...catalog, anki: { ...catalog.anki, decks } };
    expect(courses.slice(0, 4).map((c) => courseHasMaterial(withDecks, c!))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(
      courses.slice(0, 4).map((c) => assessmentHasMaterial(withDecks, c!.assessments[0]!)),
    ).toEqual([true, true, true, false]);
    const onlyTheCourse = { ...withDecks.anki, decks: [{ ...decks[0]!, assessmentId: null }] };
    expect(courseHasMaterial({ ...catalog, anki: onlyTheCourse }, courses[2]!)).toBe(true);
    expect(
      assessmentHasMaterial({ ...catalog, anki: onlyTheCourse }, courses[2]!.assessments[0]!),
    ).toBe(false);
  });

  it('takes them out with their empty decks and says how many', () => {
    const out = withoutEmptySemesters(catalog);
    expect(out.semesters.map((s) => s.number)).toEqual([1, 2, 4]);
    expect(out.hiddenSemesters).toBe(2);
    expect(out.anki.decks.map((d) => d.id)).toEqual(['root', 's4']);
  });

  it('with nothing to hide, the same catalog, without the count', () => {
    const full = { ...catalog, semesters: catalog.semesters.slice(0, 2) };
    expect(withoutEmptySemesters(full)).toBe(full);
    expect(withoutEmptySemesters(full).hiddenSemesters).toBeUndefined();
  });
});

describe('what the settings panel may change', () => {
  it('has to change something: an empty change is refused, and so is a key it does not know', () => {
    expect(SiteSettingsUpdate.safeParse({}).success).toBe(false);
    expect(SiteSettingsUpdate.safeParse({ hideEmptySemesters: false }).success).toBe(true);
    expect(SiteSettingsUpdate.safeParse({ hiddenCourses: [] }).success).toBe(true);
    expect(SiteSettingsUpdate.safeParse({ hiddenCourses: [], other: 1 }).success).toBe(false);
  });

  it('the list of courses has at most 200 names of 1 to 100 characters', () => {
    expect(
      SiteSettingsUpdate.safeParse({ hiddenCourses: Array.from({ length: 200 }, () => 'a') })
        .success,
    ).toBe(true);
    expect(
      SiteSettingsUpdate.safeParse({ hiddenCourses: Array.from({ length: 201 }, () => 'a') })
        .success,
    ).toBe(false);
    expect(SiteSettingsUpdate.safeParse({ hiddenCourses: [''] }).success).toBe(false);
    expect(SiteSettingsUpdate.safeParse({ hiddenCourses: ['a'.repeat(101)] }).success).toBe(false);
    expect(SiteSettingsUpdate.safeParse({ hiddenCourses: ['a'.repeat(100)] }).success).toBe(true);
  });
});
