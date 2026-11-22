// Tests what the home page's sections are made of: a course with a week on shows in «Tus ramos» next to the chosen
// semester's, and the first steps follow what the student has done.
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_PLAN } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { defaultPreferences } from '../../../progress/api/repository';
import { useHomeSections } from '../useHomeSections';

vi.mock('../../../progress/queries', () => ({
  useSavePreferences: () => ({ isPending: false, variables: undefined, mutate: vi.fn() }),
}));
vi.mock('../../model/todayCourses', () => ({
  todayCourses: (_catalog: unknown, plan: StudyPlan) =>
    plan.answeredDecks.length ? [{ ref: { course: { id: 'anatomia-1' } } }] : [],
}));

const prefs = (semester: number | null) => ({
  ...defaultPreferences('America/Santiago'),
  semester,
});
const ids = (courses: { id: string }[]) => courses.map((c) => c.id);

describe('the courses of «Tus ramos»', () => {
  it('are the chosen semester’s, and a course of «Hoy» from another semester joins them', () => {
    const plan = { ...EMPTY_PLAN, answeredDecks: ['20'] };
    const { result } = renderHook(() => useHomeSections(CATALOG, prefs(2), plan));
    expect(result.current.today).toHaveLength(1);
    expect(ids(result.current.mine.cards)).toEqual(['anatomia-1', 'biologia-celular']);
  });

  it('are only the chosen semester’s when nothing is on', () => {
    const { result } = renderHook(() => useHomeSections(CATALOG, prefs(2), EMPTY_PLAN));
    expect(ids(result.current.mine.cards)).toEqual(['biologia-celular']);
    expect(ids(result.current.mine.addable)).toEqual(['anatomia-1']);
  });
});
