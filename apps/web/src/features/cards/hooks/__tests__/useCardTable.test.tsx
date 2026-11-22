// Tests the table's state: typing does not change the search, a new search is a step in the history that empties
// the selection, and the forget shortcut opens its dialog only for cards that can be forgotten.
import { act, fireEvent, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { cardKey } from '@qv/study';
import { describe, expect, it, vi } from 'vitest';
import { StudyRepositoryContext } from '../../../progress/api/context';
import { defaultPreferences } from '../../../progress/api/repository';
import type { StudyRepository } from '../../../progress/api/repository';
import { browseCard } from '../../../../test/cardsFakes';
import { compiled } from '../../../../test/compiled';
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

function table(url = '/cards?q=deck:a', sources: TableSources = SOURCES) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <StudyRepositoryContext
        value={{ ratedAnswers: vi.fn(), introducedCards: vi.fn() } as unknown as StudyRepository}
      >
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      </StudyRepositoryContext>
    </MemoryRouter>
  );
  return renderHook(() => useCardTable(sources), { wrapper });
}

describe('the table', () => {
  it('keeps the search while text is typed in the box', () => {
    search.match.mockReturnValue([]);
    const { result } = table();
    for (const typed of ['d', 'de', 'dec']) act(() => result.current.search.setText(typed));
    expect(result.current.search.text).toBe('dec');
    expect(result.current.query).toBe('deck:a');
  });

  // What the compiler gives and the coverage run, without it, does not: typing makes no search.
  it.skipIf(!compiled)('searches the cards once, and typing in the box does not search them again', () => {
    search.match.mockReturnValue([]);
    const { result } = table();
    expect(search.match).toHaveBeenCalledTimes(1);
    for (const typed of ['d', 'de', 'dec']) act(() => result.current.search.setText(typed));
    expect(search.match).toHaveBeenCalledTimes(1);
  });
});

describe('a new search', () => {
  it('is the typed text, trimmed, and empties the selection', () => {
    search.match.mockReturnValue([]);
    const { result } = table();
    act(() => result.current.selection.selectAll());
    act(() => result.current.search.setText('  tag:x  '));
    const preventDefault = vi.fn();
    act(() => result.current.onSubmit({ preventDefault } as never));
    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.query).toBe('tag:x');
    expect(result.current.params.get('q')).toBe('tag:x');
  });

  it('that is blank takes the search out of the URL', () => {
    search.match.mockReturnValue([]);
    const { result } = table();
    act(() => result.current.go('   '));
    expect(result.current.params.has('q')).toBe(false);
    expect(result.current.query).toBe('');
  });

  it('from the sidebar adds its term to the search and closes the filters', () => {
    search.match.mockReturnValue([]);
    const { result } = table();
    act(() => result.current.setFilters(true));
    act(() => result.current.onSidebar('tag:x', 'and', true));
    expect(result.current.query).toBe('(deck:a) -tag:x');
    expect(result.current.filters).toBe(false);
  });
});

describe('the forget shortcut (Ctrl+Alt+N, in «Modo avanzado»)', () => {
  const FULL: TableSources = { ...SOURCES, prefs: { ...defaultPreferences(), fullAnki: true } };
  const N1 = cardKey({ noteGuid: 'n1', ord: 0 });
  const press = () =>
    fireEvent.keyDown(window, { key: 'n', code: 'KeyN', ctrlKey: true, altKey: true });

  it('opens its dialog for the current card', () => {
    search.match.mockReturnValue([browseCard({ key: N1 })]);
    const { result } = table('/cards?note=n1', FULL);
    press();
    expect(result.current.actions.forgetting).toBe(true);
  });

  it('does nothing with no card chosen', () => {
    search.match.mockReturnValue([browseCard()]);
    const { result } = table('/cards', FULL);
    press();
    expect(result.current.actions.forgetting).toBe(false);
  });

  it('does nothing for a card only the draft has', () => {
    search.match.mockReturnValue([browseCard({ key: N1, draftOnly: true })]);
    const { result } = table('/cards?note=n1', FULL);
    press();
    expect(result.current.actions.forgetting).toBe(false);
  });
});
