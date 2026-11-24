// The cards a student forgets most often, with what the card indexes say of them (code and front) and where in the
// deck tree their explorer is.

import type { CardIndex, CardIndexNote } from '@qv/schema';
import type { HardCard } from '@qv/study';

export interface HardCardRow extends HardCard {
  code: string | null;
  /** The front without the answers of its holes; null while the index has not arrived or does not have it. */
  text: string | null;
}

const HOLE = /\{\{c\d+::(?:[^}]|\}(?!\}))*?\}\}/g;

const withoutAnswers = (front: string) => front.replace(HOLE, '[…]').trim();

export function hardCardRows(
  hardest: readonly HardCard[],
  indexes: readonly CardIndex[],
): HardCardRow[] {
  const notes = new Map<string, CardIndexNote>();
  for (const index of indexes) for (const n of index.notes) notes.set(n.guid, n);
  return hardest.map((h) => {
    const note = notes.get(h.noteGuid);
    const text = note ? withoutAnswers(note.front) || note.topic || null : null;
    return { ...h, code: note?.code ?? null, text };
  });
}
