// Tests the line about the nearest test under a course of «Hoy»: when it can be said, and with what it is computed.

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeStudyBase } from '@qv/study';
import type { CourseDeckNode } from '../../../catalog/model/tree';
import { useExamLine } from '../useExamLine';

const day = vi.hoisted((): { today: number | null } => ({ today: 20_000 }));
const study = vi.hoisted(() => ({ nearestExamText: vi.fn(() => 'Certamen 1 en 5 días') }));

vi.mock('../../../progress/queries', () => ({
  usePreferences: () => ({ prefs: {} }),
  useToday: () => day.today,
}));
vi.mock('@qv/study', () => study);

const NODE = { children: [{ id: 'cert-1' }, { id: 'cert-2' }] } as CourseDeckNode;
const BASE = {
  decks: [{ id: 'cert-1' }],
  plan: {},
  prefs: {},
  progress: [{ deckId: 'cert-1' }],
} as unknown as HomeStudyBase;

beforeEach(() => {
  day.today = 20_000;
  study.nearestExamText.mockClear();
});

describe('the line of the nearest test', () => {
  it("is computed over the course's assessments, its progress and today", () => {
    const { result } = renderHook(() => useExamLine(NODE, BASE));
    expect(result.current).toBe('Certamen 1 en 5 días');
    expect(study.nearestExamText).toHaveBeenCalledWith(
      BASE.decks,
      BASE.plan,
      BASE.progress,
      ['cert-1', 'cert-2'],
      20_000,
      BASE.prefs,
    );
  });

  it('without progress, counts none', () => {
    const { progress: _, ...withoutProgress } = BASE;
    renderHook(() => useExamLine(NODE, withoutProgress));
    expect(study.nearestExamText).toHaveBeenCalledWith(
      BASE.decks,
      BASE.plan,
      [],
      ['cert-1', 'cert-2'],
      20_000,
      BASE.prefs,
    );
  });

  it('says nothing until the study data and the day are known', () => {
    expect(renderHook(() => useExamLine(NODE, null)).result.current).toBeNull();
    day.today = null;
    expect(renderHook(() => useExamLine(NODE, BASE)).result.current).toBeNull();
    expect(study.nearestExamText).not.toHaveBeenCalled();
  });
});
