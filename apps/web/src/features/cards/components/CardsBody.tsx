// The cards page under its title: the controls, the line of a heatmap day, the list (or the table, or why there is
// none), the filters and the viewer.

import { ErrorWithRetry } from '../../../shared/ui/Notice';
import type { AnkiTree } from '../../catalog/model/tree';
import type { CardsScope } from '../../catalog/model/scope';
import type { Matched } from '../model/filters';
import { cardParam } from '../model/urlState';
import { useCardsBody } from '../hooks/useCardsBody';
import type { CardsBodyState } from '../hooks/useCardsBody';
import { useViewerCards } from '../hooks/useViewerCards';
import { CardsControls } from './CardsControls';
import { CardsFiltersPanel } from './CardsFiltersPanel';
import { CardsListView } from './CardsListView';
import { CardsChanged, CardsMissing } from './CardsNotices';
import { CardsTable } from './CardsTable';
import { CardsViewer } from './CardsViewer';
import { DayLine } from './DayLine';

export function CardsBody({ scope, tree }: { scope: CardsScope; tree: AnkiTree }) {
  const b = useCardsBody(scope, tree);
  const { params, set, data, table, day } = b;
  const { open, viewerCards, viewerIndex } = useViewerCards({
    params,
    data,
    table,
    lectures: b.lectures,
  });
  const openNote = (m: Matched) => set({ card: cardParam(m.cards[0]!) }, false);

  return (
    <>
      <CardsControls
        scope={scope}
        unit={b.unitDeck ? b.unit : ''}
        onUnit={(u) => set({ unit: u || null })}
        query={b.q}
        onQuery={(text) => set({ q: text || null })}
        full={b.full}
        table={table}
        onTable={(on) => set({ view: on ? 'table' : null, card: null }, false)}
        onFilters={() => b.setPanel(true)}
        showSearch={!table}
      />
      {params.get('day') ? (
        <DayLine
          day={day.day}
          value={day.value}
          onClear={() => set({ day: null })}
          failed={!!day.error}
          onRetry={day.retry}
        />
      ) : null}
      <CardsMain
        b={b}
        scope={scope}
        tree={tree}
        onOpen={openNote}
        reveal={open?.noteGuid ?? null}
      />

      {table ? null : <CardsFiltersPanel b={b} />}

      {viewerCards && viewerIndex >= 0 && data ? (
        <CardsViewer
          cards={viewerCards}
          index={viewerIndex}
          byKey={data.byKey}
          prefs={data.prefs}
          onIndexChange={(i) => set({ card: cardParam(viewerCards[i]!) })}
          onClose={() => set({ card: null })}
        />
      ) : null}
    </>
  );
}

function CardsMain({
  b,
  scope,
  tree,
  onOpen,
  reveal,
}: {
  b: CardsBodyState;
  scope: CardsScope;
  tree: AnkiTree;
  onOpen: (m: Matched) => void;
  reveal: string | null;
}) {
  const { cards, data } = b;
  if (cards.missing) return <CardsMissing />;
  if (cards.changed) return <CardsChanged />;
  if (cards.error && !data) return <ErrorWithRetry error={cards.error} onRetry={cards.retry} />;
  if (b.table && data) {
    return <CardsTable scope={scope} tree={tree} data={data} unitDecks={b.filters.unitDecks} />;
  }
  return <CardsListView b={b} scope={scope} onOpen={onOpen} reveal={reveal} />;
}
