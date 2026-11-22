// The cards page's controls: the week or lecture, the search box (a moment after typing stops), «Lista / Tabla» in
// «Modo avanzado» and the filters' button on a narrow screen.

import { LayoutList, Search, SlidersHorizontal, Table2 } from 'lucide-react';
import { Select } from '../../../shared/ui/Select';
import { button } from '../../../shared/ui/styles';
import { unitOptions } from '../../catalog/model/scope';
import type { CardsScope } from '../../catalog/model/scope';
import { useQueryBox } from '../hooks/useQueryBox';
import { cardsControlsStrings } from './strings/CardsControls.strings';
import { cardsFiltersPanelStrings } from './strings/CardsFiltersPanel.strings';

export function CardsControls({
  scope,
  unit,
  onUnit,
  query,
  onQuery,
  full,
  table,
  onTable,
  onFilters,
  showSearch,
}: {
  scope: CardsScope;
  unit: string;
  onUnit: (unit: string) => void;
  query: string;
  onQuery: (q: string) => void;
  full: boolean;
  table: boolean;
  onTable: (on: boolean) => void;
  onFilters: () => void;
  showSearch: boolean;
}) {
  const options = unitOptions(scope.node, unit);
  const [text, setText] = useQueryBox(query, onQuery);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Select
        label={cardsControlsStrings.page.unit}
        value={unit}
        options={options}
        onChange={onUnit}
        className="h-10 w-full sm:w-64"
      />
      {showSearch ? (
        <form
          role="search"
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            onQuery(text.trim());
          }}
        >
          <label className="relative block">
            <span className="sr-only">{cardsControlsStrings.page.search}</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={cardsControlsStrings.page.searchHint(full)}
              className="h-10 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm placeholder:text-muted"
            />
          </label>
        </form>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {full ? <ViewSwitch table={table} onTable={onTable} /> : null}
      {table ? null : (
        <button
          type="button"
          onClick={onFilters}
          className={`${button.base} ${button.secondary} h-10 flex-none px-3 py-0 xl:hidden`}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />{' '}
          {cardsFiltersPanelStrings.page.filters}
        </button>
      )}
    </div>
  );
}

function ViewSwitch({ table, onTable }: { table: boolean; onTable: (on: boolean) => void }) {
  return (
    <div
      role="group"
      aria-label={cardsControlsStrings.page.view}
      className="flex h-10 flex-none rounded-lg border border-border"
    >
      <button
        type="button"
        aria-pressed={!table}
        aria-label={cardsControlsStrings.page.list}
        onClick={() => onTable(false)}
        className={`flex items-center gap-1.5 rounded-l-lg px-3 text-sm ${!table ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
      >
        <LayoutList className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{cardsControlsStrings.page.list}</span>
      </button>
      <button
        type="button"
        aria-pressed={table}
        aria-label={cardsControlsStrings.page.table}
        onClick={() => onTable(true)}
        className={`flex items-center gap-1.5 rounded-r-lg px-3 text-sm ${table ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
      >
        <Table2 className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{cardsControlsStrings.page.table}</span>
      </button>
    </div>
  );
}
