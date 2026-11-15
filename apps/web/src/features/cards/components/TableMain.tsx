// The table's middle column: the search, the toolbar, what an action could not do, the count and the grid.

import { Notice } from '../../../shared/ui/Notice';
import type { CardTableState } from '../hooks/useCardTable';
import { CardGrid } from './CardGrid';
import { TableSearch } from './TableSearch';
import { TableToolbar } from './TableToolbar';

export function TableMain({ t }: { t: CardTableState }) {
  const { view, setView, search, selection, runner, actions } = t;
  const { list } = search;
  const count = selection.effectiveSelection.size;
  const noun = view.mode === 'notes' ? 'notas' : 'tarjetas';
  return (
    <div className="min-w-0">
      <TableSearch
        full={t.full}
        text={search.text}
        onText={search.setText}
        onSubmit={t.onSubmit}
        onFilters={() => t.setFilters(true)}
        inputRef={t.searchBox}
        query={t.query}
        onSearch={t.go}
        error={search.searchError}
      />
      <TableToolbar
        full={t.full}
        view={view}
        setView={setView}
        onMode={(mode) => {
          setView({ mode });
          selection.clear();
        }}
        busy={runner.busy}
        count={count}
        focus={selection.focus}
        actions={{ ...actions, askForget: () => actions.setForgetting(true), undo: runner.undo }}
      />
      {runner.problem ? (
        <div className="mt-3">
          <Notice title="No se pudo hacer">{runner.problem}</Notice>
        </div>
      ) : null}

      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {search.waiting
          ? 'Buscando…'
          : `${list.length} ${noun}${count > 1 ? ` · ${count} seleccionadas` : ''}`}
      </p>
      <CardGrid
        list={list}
        columns={view.columns}
        sort={view.sort}
        onSort={(column) =>
          setView({
            sort: {
              column,
              descending: view.sort.column === column ? !view.sort.descending : false,
            },
          })
        }
        selected={selection.effectiveSelection}
        current={selection.current?.key ?? null}
        onSelect={selection.select}
        onSelectAll={selection.selectAll}
        timing={t.timing}
        label={view.mode === 'notes' ? 'Notas' : 'Tarjetas'}
      />
    </div>
  );
}
