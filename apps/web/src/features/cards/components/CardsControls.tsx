// The cards page's controls: the week or lecture, the search box (a moment after typing stops), «Lista / Tabla» in
// «Modo avanzado» and the filters' button on a narrow screen.
import { useMemo } from 'react';
import { LayoutList, Search, SlidersHorizontal, Table2 } from 'lucide-react';
import { Select } from '../../../shared/ui/Select';
import { button } from '../../../shared/ui/styles';
import { unitOptions } from '../../catalog/model/scope';
import type { CardsScope } from '../../catalog/model/scope';
import { useQueryBox } from '../hooks/useQueryBox';

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
  const options = useMemo(() => unitOptions(scope.node, unit), [scope.node, unit]);
  const [text, setText] = useQueryBox(query, onQuery);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Select
        label="Semana o clase"
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
            <span className="sr-only">Buscar en estas tarjetas</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={full ? 'Texto, código o sintaxis de Anki' : 'Buscar por texto o código'}
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
          <SlidersHorizontal className="size-4" aria-hidden="true" /> Filtros
        </button>
      )}
    </div>
  );
}

function ViewSwitch({ table, onTable }: { table: boolean; onTable: (on: boolean) => void }) {
  return (
    <div
      role="group"
      aria-label="Vista"
      className="flex h-10 flex-none rounded-lg border border-border"
    >
      <button
        type="button"
        aria-pressed={!table}
        aria-label="Lista"
        onClick={() => onTable(false)}
        className={`flex items-center gap-1.5 rounded-l-lg px-3 text-sm ${!table ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
      >
        <LayoutList className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Lista</span>
      </button>
      <button
        type="button"
        aria-pressed={table}
        aria-label="Tabla"
        onClick={() => onTable(true)}
        className={`flex items-center gap-1.5 rounded-r-lg px-3 text-sm ${table ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
      >
        <Table2 className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Tabla</span>
      </button>
    </div>
  );
}
