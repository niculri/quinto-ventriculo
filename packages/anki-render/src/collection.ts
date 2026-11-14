// Renders the cards of a whole collection, looking up each note, note type and deck once.
import { renderCard } from './render';
import type { RenderedCard } from './render';

/** A subset of @qv/anki-format's AnkiCollection, which this leaf package cannot import. */
export interface CollectionLike {
  noteTypes: {
    id: string;
    name: string;
    kind: 'normal' | 'cloze';
    fields: string[];
    templates: { name: string; qfmt: string; afmt: string }[];
  }[];
  decks: { id: string; name: string }[];
  notes: { id: string; noteTypeId: string; fields: string[]; tags: string[] }[];
}

export interface CardLike {
  id: string;
  noteId: string;
  ord: number;
  deckId: string;
  originalDeckId: string | null;
  flags: number;
}

export function createCardRenderer(collection: CollectionLike): (card: CardLike) => RenderedCard {
  const noteTypes = new Map(collection.noteTypes.map((t) => [t.id, t]));
  const notes = new Map(collection.notes.map((n) => [n.id, n]));
  const decks = new Map(collection.decks.map((d) => [d.id, d.name]));
  return (card) => {
    const note = notes.get(card.noteId);
    const noteType = note && noteTypes.get(note.noteTypeId);
    if (!note || !noteType) {
      const error = `Card ${card.id} without its note or note type.`;
      return { question: error, answer: error, isEmpty: true, error };
    }
    return renderCard({
      noteType,
      fields: note.fields,
      tags: note.tags,
      ord: card.ord,
      deckName: decks.get(card.originalDeckId ?? card.deckId) ?? '(Deck)',
      cardId: card.id,
      flags: card.flags,
    });
  };
}
