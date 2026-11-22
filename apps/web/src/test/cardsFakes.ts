// A row of the cards table built by hand: a new basic card of note «n1» in deck «20», with what a test changes in the
// patch (the note's fields go in `note`).
import type { BrowseNote } from '@qv/schema';
import type { BrowseCard } from '../features/cards/model/browseCards';

export function browseCard(
  patch: Partial<Omit<BrowseCard, 'note'>> & { note?: Partial<BrowseNote> } = {},
): BrowseCard {
  const { note: notePatch, ...rest } = patch;
  const note: BrowseNote = {
    guid: 'n1',
    noteTypeId: '1',
    tags: [],
    code: 'T-PR-01-001',
    version: 1,
    createdAt: null,
    fields: ['Frente', 'Reverso'],
    sortField: 'Frente',
    cards: [{ ord: 0, deckId: '20' }],
    ...notePatch,
  };
  return {
    key: `${note.guid}/0`,
    note,
    noteType: undefined,
    kind: 'basic',
    deck: undefined,
    template: 'Directa',
    position: 1,
    row: undefined,
    dueAt: null,
    intraday: false,
    draftOnly: false,
    noteGuid: note.guid,
    ord: 0,
    deckId: '20',
    noteTypeId: note.noteTypeId,
    tags: note.tags,
    fields: note.fields,
    createdMs: null,
    type: 'new',
    queue: 'new',
    due: null,
    interval: 0,
    reps: 0,
    lapses: 0,
    flag: 0,
    stability: null,
    difficulty: null,
    lastReview: null,
    decay: null,
    ...rest,
  };
}
