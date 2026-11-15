// The table's big viewer (`open=1` in the URL): the cards of the table in its order, from the current one.

import type { SetURLSearchParams } from 'react-router';
import { CardViewer } from '../../decks/CardViewer';
import { viewerSummaries } from '../model/browseCards';
import type { BrowseCard } from '../model/browseCards';

export function TableViewer({
  cards,
  urlCard,
  params,
  setParams,
}: {
  cards: BrowseCard[];
  urlCard: string | null;
  params: URLSearchParams;
  setParams: SetURLSearchParams;
}) {
  const index = urlCard ? cards.findIndex((c) => c.key === urlCard) : -1;
  if (!params.get('open') || index < 0) return null;
  return (
    <CardViewer
      cards={viewerSummaries(cards)}
      index={index}
      onIndexChange={(i) => {
        const c = cards[i]!;
        const next = new URLSearchParams(params);
        next.set('note', c.noteGuid);
        next.set('ord', String(c.ord));
        setParams(next, { replace: true });
      }}
      onClose={() => {
        const next = new URLSearchParams(params);
        next.delete('open');
        setParams(next, { replace: true });
      }}
    />
  );
}
