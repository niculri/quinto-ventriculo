// The table's search box (Anki's syntax in «Modo avanzado»), the button that opens the sidebar on a narrow screen,
// the one-click filters of the simple mode and what is wrong with a search.

import type { RefObject, SyntheticEvent } from 'react';
import { Filter, Search } from 'lucide-react';
import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';
import { QuickFilters } from './QuickFilters';
import { columnsStrings } from '../model/strings/columns.strings';
import { cardsListViewStrings } from './strings/CardsListView.strings';

export function TableSearch({
  full,
  text,
  onText,
  onSubmit,
  onFilters,
  inputRef,
  query,
  onSearch,
  error,
}: {
  full: boolean;
  text: string;
  onText: (text: string) => void;
  onSubmit: (e: SyntheticEvent) => void;
  onFilters: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onSearch: (q: string) => void;
  error: string | null;
}) {
  return (
    <>
      <form onSubmit={onSubmit} role="search" className="flex gap-2">
        <button
          type="button"
          onClick={onFilters}
          className={`${button.base} ${button.secondary} px-3 xl:hidden`}
          aria-label={columnsStrings.table.sidebar}
        >
          <Filter className="size-4" aria-hidden="true" />
        </button>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{columnsStrings.table.searchLabel(full)}</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder={columnsStrings.table.searchHint(full)}
            className="w-full rounded-lg border border-border bg-surface py-2.5 pr-3 pl-9 font-mono text-sm placeholder:font-sans placeholder:text-muted"
          />
        </label>
        <button type="submit" className={`${button.base} ${button.primary}`}>
          {columnsStrings.table.search}
        </button>
      </form>
      {full ? null : <QuickFilters query={query} onSearch={onSearch} />}
      {error ? (
        <div className="mt-3">
          <Notice title={cardsListViewStrings.badSearch}>{error}</Notice>
        </div>
      ) : null}
    </>
  );
}
