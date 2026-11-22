// Tests the table's state: the search over the cards is not done again by a render that changes nothing, as typing in
// the box (each key renders the table) must not cost a search of every card.
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { StudyRepositoryContext } from '../../../progress/api/context';
import { defaultPreferences } from '../../../progress/api/repository';
import type { StudyRepository } from '../../../progress/api/repository';
import type { TableSources } from '../../model/tableData';
import { useCardTable } from '../useCardTable';

const search = vi.hoisted(() => ({ match: vi.fn() }));

vi.mock('../../model/search', async (original) => ({
  ...(await original<object>()),
  matchCards: search.match,
}));

const SOURCES: TableSources = {
  notes: [],
  noteTypes: [],
  authorPresets: [],
  tree: { nodes: [], byId: new Map(), children: new Map() } as unknown as TableSources['tree'],
  rows: [],
  prefs: defaultPreferences(),
  presets: [],
  settings: [],
  roots: [],
  draftOnly: new Set(),
};

function table() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/cards?q=deck:a']}>
      <StudyRepositoryContext
        value={{ ratedAnswers: vi.fn(), introducedCards: vi.fn() } as unknown as StudyRepository}
      >
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      </StudyRepositoryContext>
    </MemoryRouter>
  );
  return renderHook(() => useCardTable(SOURCES), { wrapper });
}

describe('the table', () => {
  it('searches the cards once, and typing in the box does not search them again', () => {
    search.match.mockReturnValue([]);
    const { result } = table();
    expect(search.match).toHaveBeenCalledTimes(1);
    for (const typed of ['d', 'de', 'dec']) act(() => result.current.search.setText(typed));
    expect(result.current.search.text).toBe('dec');
    expect(search.match).toHaveBeenCalledTimes(1);
  });

  it('keeps the same timing between renders, so what depends on it is not built again', () => {
    search.match.mockReturnValue([]);
    const { result, rerender } = table();
    const first = result.current.timing;
    rerender();
    expect(result.current.timing).toBe(first);
  });
});
