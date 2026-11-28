// What each card of the cards page is for the student (new, seen, hard, hidden; marked), note by note.

import type { CardIndexNote } from '@qv/schema';
import type { CardRef, StoredCard } from '@qv/schema/user';
import { cardKey, isHard } from '@qv/study';

export type CardStatus = 'new' | 'seen' | 'hard' | 'hidden';

function cardStatus(row: StoredCard | undefined): CardStatus {
  if (!row) return 'new';
  if (row.suspended) return 'hidden';
  if (row.phase === 'new') return 'new';
  return isHard(row) ? 'hard' : 'seen';
}

export interface ExplorerCard extends CardRef {
  key: string;
  status: CardStatus;
  marked: boolean;
}

export interface ExplorerNote {
  note: CardIndexNote;
  assessmentId: string;
  lectureId: string;
  image: boolean;
  cards: ExplorerCard[];
  index: number;
}

/**
 * The index turns every tag into a space (`<b>axial</b>.` is «axial .», the text the search reads): the list shows it
 * without the space before a closing sign or after an opening one.
 */
export const tidyText = (text: string) =>
  text.replace(/\s+([.,;:!?…)\]»])/g, '$1').replace(/([([«¿¡])\s+/g, '$1');

/**
 * The notes of the indexes with the student's state, by lecture in the order of the deck list (`position`), which the
 * codes do not always follow (S10 is before S9 by code), and in the index's order within a lecture.
 */
export function explorerNotes(
  indexes: readonly { assessmentId: string; notes: readonly CardIndexNote[] }[],
  lectureOf: (deckId: string) => string,
  rows: ReadonlyMap<string, StoredCard>,
  position: (lectureId: string) => number = () => 0,
): ExplorerNote[] {
  const out: Omit<ExplorerNote, 'index'>[] = [];
  for (const index of indexes) {
    for (const note of index.notes) {
      if (!note.cards.length) continue;
      out.push({
        note: {
          ...note,
          topic: tidyText(note.topic),
          front: tidyText(note.front),
          back: tidyText(note.back),
        },
        assessmentId: index.assessmentId,
        lectureId: lectureOf(note.cards[0]!.deckId),
        image: note.kind === 'occlusion' || note.kind === 'photo',
        cards: note.cards.map((c) => {
          const key = cardKey({ noteGuid: note.guid, ord: c.ord });
          const row = rows.get(key);
          return {
            key,
            noteGuid: note.guid,
            ord: c.ord,
            deckId: c.deckId,
            status: cardStatus(row),
            marked: !!row?.flag,
          };
        }),
      });
    }
  }
  return out
    .map((n, i) => ({ n, i, at: position(n.lectureId) }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map(({ n }, index) => ({ ...n, index }));
}
