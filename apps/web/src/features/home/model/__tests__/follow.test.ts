// Tests «Seguir»: which tests half done it lists and where each one goes back to.

import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { followItems } from '../follow';

const round = (sectionId: string) => ({
  quizId: 'practica-biocel',
  sectionId,
  answered: 1,
  questionCount: 4,
});

describe('«Seguir»', () => {
  it('a test with several sections goes back to the section half done', () => {
    expect(followItems(CATALOG, [round('pautas')], null)[0]!.to).toBe(
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas',
    );
  });

  it('a test of one section goes to the test itself', () => {
    const catalog = structuredClone(CATALOG);
    catalog.semesters[1]!.courses[0]!.assessments[0]!.quizzes[0]!.sectionCount = 1;
    expect(followItems(catalog, [round('pautas')], null)[0]!.to).toBe(
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica',
    );
  });
});
