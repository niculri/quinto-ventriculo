// Tests the two lists of «Tus ramos»: the semesters to choose and the courses of other semesters to add.

import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { addableOptions, semesterOptions } from '../courseOptions';
import type { MyCourses } from '../myCourses';

const course = (semester: number) => ({
  ...CATALOG.semesters[0]!.courses[0]!,
  id: `ramo-${semester}`,
  name: `Ramo ${semester}`,
  emoji: '📘',
  semester,
});

describe('the lists of «Tus ramos»', () => {
  it('offers «Elige tu semestre» only until one is chosen, and only semesters with courses', () => {
    const catalog = {
      ...CATALOG,
      semesters: [
        ...CATALOG.semesters,
        { ...CATALOG.semesters[0]!, number: 9, name: '9° Semestre', courses: [] },
      ],
    };
    expect(semesterOptions(catalog, { semester: null }).map((o) => o.label)).toEqual([
      'Elige tu semestre',
      '1° Semestre',
      '2° Semestre',
    ]);
    expect(semesterOptions(catalog, { semester: 2 }).map((o) => o.value)).toEqual(['1', '2']);
  });

  it('names each course to add with its semester, or without it when the catalog lacks it', () => {
    const courses = { addable: [course(1), course(7)] } as unknown as MyCourses;
    expect(addableOptions(CATALOG, courses)).toEqual([
      { value: 'ramo-1', label: '📘 Ramo 1 · 1° Semestre' },
      { value: 'ramo-7', label: '📘 Ramo 7 · ' },
    ]);
  });
});
