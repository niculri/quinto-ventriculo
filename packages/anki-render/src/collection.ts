import { renderCard } from './render';
import type { RenderedCard } from './render';

/** The parts of a collection the renderer needs (the shape of @qv/anki-format's AnkiCollection). */
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

/** Renders the cards of a collection (the note, its type and its deck are looked up once). */
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
