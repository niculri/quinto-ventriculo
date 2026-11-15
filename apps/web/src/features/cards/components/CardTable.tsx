// Anki's browser («Explorar»), the cards page's table in «Modo avanzado»: Anki's search, chosen columns, the
// selected card's preview and information, and undoable actions on the selection.

import { Rail } from '../../../shared/ui/rail';
import { LiveToast } from '../../../shared/ui/Toast';
import { cardsOfRows } from '../model/browseCards';
import type { TableSources } from '../model/tableData';
import { useCardTable } from '../hooks/useCardTable';
import { BrowseSidebar } from './BrowseSidebar';
import { ForgetDialog } from './ForgetDialog';
import { SidebarDialog } from './SidebarDialog';
import { TableMain } from './TableMain';
import { TablePreview } from './TablePreview';
import { TableViewer } from './TableViewer';

export function CardTable({ sources }: { sources: TableSources }) {
  const t = useCardTable(sources);
  const { data, params, setParams, view, selection, actions } = t;
  const sidebar = (
    <BrowseSidebar
      courses={t.roots}
      noteTypes={data.noteTypes}
      tags={[...new Set(data.notes.flatMap((n) => n.tags))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      )}
      full={t.full}
      onSearch={t.onSidebar}
    />
  );

  return (
    <div className="mt-4 min-w-0">
      <Rail>
        <aside aria-label="Barra lateral" className="text-sm">
          {sidebar}
        </aside>
      </Rail>
      <TableMain t={t} />

      <TablePreview
        current={selection.current}
        mode={view.mode}
        timing={t.timing}
        onEnlarge={() => {
          const next = new URLSearchParams(params);
          next.set('open', '1');
          setParams(next);
        }}
      />

      <SidebarDialog open={t.filters} onOpenChange={t.setFilters}>
        {sidebar}
      </SidebarDialog>

      <TableViewer
        cards={cardsOfRows(t.search.list, view.mode)}
        urlCard={selection.urlCard}
        params={params}
        setParams={setParams}
      />

      <ForgetDialog
        open={actions.forgetting}
        count={selection.chosen().length}
        onCancel={() => actions.setForgetting(false)}
        onForget={actions.forget}
      />

      <LiveToast message={t.runner.toast} low />
    </div>
  );
}
