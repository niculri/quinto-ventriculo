// The cards the viewer goes through: those of the list when it was opened, so that an action of it does not move the
// list under it; a card the list does not have (a pasted code) is shown alone.

import { useState } from 'react';
import type { CardSummary } from '@qv/schema';
import type { Lecture } from '../model/explorer';
import { parseCardParam, summaryOf } from '../model/urlState';
import type { CardsData } from './useCardsData';

export function useViewerCards({
  params,
  data,
  table,
  lectures,
}: {
  params: URLSearchParams;
  data: CardsData | undefined;
  table: boolean;
  lectures: Lecture[];
}) {
  const open = parseCardParam(params.get('card'));
  const [viewerCards, setViewerCards] = useState<CardSummary[] | null>(null);
  const listCards = (): CardSummary[] =>
    lectures.flatMap((l) =>
      l.groups.flatMap((g) => g.items.flatMap((m) => m.cards.map((c) => summaryOf(m.note, c)))),
    );
  if (open && data && !table && viewerCards === null) {
    const list = listCards();
    const found = list.some((c) => c.noteGuid === open.noteGuid && c.ord === open.ord);
    if (found) setViewerCards(list);
    else {
      const note = data.notes.find((n) => n.note.guid === open.noteGuid);
      const card = note?.cards.find((c) => c.ord === open.ord);
      if (note && card) setViewerCards([summaryOf(note, card)]);
    }
  }
  if (!open && viewerCards !== null) setViewerCards(null);
  const viewerIndex =
    open && viewerCards
      ? viewerCards.findIndex((c) => c.noteGuid === open.noteGuid && c.ord === open.ord)
      : -1;
  return { open, viewerCards, viewerIndex };
}
