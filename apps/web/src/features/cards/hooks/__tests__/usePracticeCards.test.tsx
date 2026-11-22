// Tests the cards of «Practicar estas»: no scope and no round while the catalog loads, none while a text search or a
// day still reads, and the round fixed when it is first known (what practicing changes does not change it).
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree } from '../../../catalog/model/tree';
import type { CourseDeckNode } from '../../../catalog/model/tree';
import { usePracticeCards } from '../usePracticeCards';

const read = vi.hoisted(() => ({
  catalog: undefined as unknown,
  scopes: [] as unknown[],
  data: undefined as unknown,
  textWaiting: false,
  dayWaiting: false,
}));

vi.mock('../../../catalog/hooks/useAnkiTree', () => ({
  useAnkiTree: () => ({ catalog: { data: read.catalog }, tree: null }),
}));
vi.mock('../useCardsData', () => ({
  useCardsData: (scope: unknown) => {
    read.scopes.push(scope);
    return { data: read.data };
  },
}));
vi.mock('../useFailed', () => ({ useFailed: () => ({ data: new Set() }) }));
vi.mock('../useTextMatch', () => ({
  useTextMatch: () => ({ keys: null, error: null, waiting: read.textWaiting }),
}));
vi.mock('../useDayCards', () => ({
  useDayCards: () => ({ value: null, waiting: read.dayWaiting }),
}));

const NODE = buildAnkiTree(CATALOG).nodes.find((n) => n.assessmentId) as CourseDeckNode;
const DATA = { notes: [], prefs: { fullAnki: false } };

function practice() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/practice?state=all']}>{children}</MemoryRouter>
  );
  return renderHook(() => usePracticeCards(NODE), { wrapper });
}

beforeEach(() => {
  read.catalog = CATALOG;
  read.scopes = [];
  read.data = DATA;
  read.textWaiting = false;
  read.dayWaiting = false;
});

describe('the practice’s cards', () => {
  it('have no scope and no round while the catalog loads', () => {
    read.catalog = undefined;
    const { result } = practice();
    expect(read.scopes.every((s) => s === null)).toBe(true);
    expect(result.current.first).toBeNull();
  });

  it.each([
    ['the text search', 'textWaiting'],
    ['the day', 'dayWaiting'],
  ] as const)('wait for %s', (_what, flag) => {
    read[flag] = true;
    expect(practice().result.current.first).toBeNull();
  });

  it('are the list’s once known, and stay so', () => {
    const { result, rerender } = practice();
    const first = result.current.first;
    expect(first).toEqual([]);
    expect(read.scopes.at(-1)).toMatchObject({ node: NODE });
    read.data = { ...DATA };
    rerender();
    expect(result.current.first).toBe(first);
  });
});
