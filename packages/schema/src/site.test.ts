import { describe, expect, it } from 'vitest';
import { semesterHasMaterial, withoutEmptySemesters } from './api';
import type { Catalog } from './api';

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

describe('the semesters without material (step 1.8)', () => {
  it('an article, a test or a deck with cards is material; a course or an empty deck is not', () => {
    expect(catalog.semesters.map((s) => semesterHasMaterial(catalog, s))).toEqual([
      true,
      true,
      false,
      true,
      false,
    ]);
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
