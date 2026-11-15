// The cards of «Practicar estas» (never two of a note in a row) and how many cards the list has.
import type { CardRef } from '@qv/schema/user';
import { apartSiblings } from '@qv/study';
import type { Matched } from './filters';
import type { Lecture } from './groups';
import type { StateFilter } from './filters';

export function practiceCards(lectures: readonly Lecture[], state: StateFilter): CardRef[] {
  const cards = lectures.flatMap((l) =>
    l.groups.flatMap((g) =>
      g.items.flatMap((m) =>
        m.cards
          .filter((c) => !(c.status === 'hidden' && state !== 'hidden'))
          .map((c) => ({ ref: { noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId } })),
      ),
    ),
  );
  return apartSiblings(cards).map((c) => c.ref);
}

export const cardCount = (matched: readonly Matched[]) =>
  matched.reduce((t, m) => t + m.cards.length, 0);
