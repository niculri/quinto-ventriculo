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

export function explorerNotes(
  indexes: readonly { assessmentId: string; notes: readonly CardIndexNote[] }[],
  lectureOf: (deckId: string) => string,
  rows: ReadonlyMap<string, StoredCard>,
): ExplorerNote[] {
  const out: ExplorerNote[] = [];
  for (const index of indexes) {
    for (const note of index.notes) {
      if (!note.cards.length) continue;
      out.push({
        note,
        assessmentId: index.assessmentId,
        lectureId: lectureOf(note.cards[0]!.deckId),
        image: note.kind === 'occlusion' || note.kind === 'photo',
        index: out.length,
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
  return out;
}
