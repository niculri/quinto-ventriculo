// Tests how many questions of a test only the draft has: the catalog's count above the students', for that test alone.
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Catalog } from '@qv/schema';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { QUIZ } from '../../../../test/fixtures/quiz';
import { useDraftQuestions } from '../useDraftQuestions';

const h = vi.hoisted(() => ({ catalog: undefined as Catalog | undefined }));
vi.mock('../../../catalog/hooks/useCatalog', () => ({ useCatalog: () => ({ data: h.catalog }) }));

/** The catalog with the test and another one, each with the questions the draft has. */
function listing(own: number, other: number, adminOnly: Catalog['adminOnly']): Catalog {
  const catalog = structuredClone(CATALOG);
  const assessment = catalog.semesters[1]!.courses[0]!.assessments[0]!;
  const mine = assessment.quizzes[0]!;
  assessment.quizzes = [
    { ...mine, id: 'otro', slug: 'otro', questionCount: other },
    { ...mine, questionCount: own },
  ];
  return { ...catalog, adminOnly };
}

describe('the questions only the draft has', () => {
  it('are the catalog’s count of that test above the students’, not those of another test', () => {
    h.catalog = listing(QUIZ.questionCount + 3, 40, {});
    expect(renderHook(() => useDraftQuestions(QUIZ)).result.current).toBe(3);
  });

  it('are none when the draft has fewer, or when the catalog does not say what is the draft’s', () => {
    h.catalog = listing(QUIZ.questionCount - 1, 40, {});
    expect(renderHook(() => useDraftQuestions(QUIZ)).result.current).toBe(0);
    h.catalog = listing(QUIZ.questionCount + 3, 40, undefined);
    expect(renderHook(() => useDraftQuestions(QUIZ)).result.current).toBe(0);
    h.catalog = undefined;
    expect(renderHook(() => useDraftQuestions(QUIZ)).result.current).toBe(0);
  });
});
