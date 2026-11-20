// The Anki tree of a made-up study history, as anki_deck_tree() gives it.
import type { AnkiTreeDeck, CardSummary } from '@qv/schema';
import type { StudyData } from '@qv/study';

export function catalogOf(data: StudyData, cards: CardSummary[]): AnkiTreeDeck[] {
  return data.decks.map((d) => {
    const mine = cards.filter((c) => c.deckId === d.id);
    const below = data.decks.filter((x) => x.name === d.name || x.name.startsWith(`${d.name}::`));
    const notes = new Set(mine.map((c) => c.noteGuid));
    return {
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      preset: d.authorPreset,
      semester: null,
      courseId: null,
      assessmentId: null,
      noteCount: 0,
      cardCount: 0,
      ownNoteCount: notes.size,
      exclusiveNoteCount: [...notes].filter((n) =>
        cards.filter((c) => c.noteGuid === n).every((c) => c.deckId === d.id),
      ).length,
      closedNoteCount: [...notes].filter((n) =>
        cards.filter((c) => c.noteGuid === n).every((c) => below.some((x) => x.id === c.deckId)),
      ).length,
    };
  });
}
