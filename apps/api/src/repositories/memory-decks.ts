import type {
  AnkiCatalog,
  AnkiNoteTypeRecord,
  BrowseData,
  CardDetail,
  CardKind,
  CardSummary,
  ContentBundle,
  DeckDetail,
} from '@qv/schema';
import { ankiPlainText } from '@qv/schema';

/** The Anki decks of an importer bundle, answered like the SQL functions of the content database. */
export function memoryDecks(bundle: ContentBundle) {
  const decks = new Map(bundle.ankiDecks.map((d) => [d.id, d]));
  const children = new Map<string, string[]>();
  for (const d of bundle.ankiDecks) {
    if (d.parentId) children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
  }
  const noteTypes = new Map(bundle.ankiNoteTypes.map((t) => [t.id, t]));
  const cards = bundle.ankiNotes.flatMap((note) =>
    note.cards.map((card) => ({ note, card, type: noteTypes.get(note.noteTypeId) })),
  );

  /** The deck and its descendants, parents before children (breadth first). */
  const subtree = (id: string): { id: string; depth: number }[] => {
    const out = [{ id, depth: 0 }];
    for (let i = 0; i < out.length; i++) {
      for (const c of children.get(out[i]!.id) ?? []) out.push({ id: c, depth: out[i]!.depth + 1 });
    }
    return out;
  };
  const stats = (id: string) => {
    const ids = new Set(subtree(id).map((x) => x.id));
    const inside = cards.filter((c) => ids.has(c.card.deckId));
    return { noteCount: new Set(inside.map((c) => c.note.guid)).size, cardCount: inside.length };
  };
  /**
   * Notes with a card directly in the deck, those with every card in it and those with every card in it or below it
   * (`anki_deck_tree()`, step 3.2).
   */
  const own = (id: string) => {
    const notes = new Set(cards.filter((c) => c.card.deckId === id).map((c) => c.note));
    const below = new Set(subtree(id).map((x) => x.id));
    return {
      ownNoteCount: notes.size,
      exclusiveNoteCount: [...notes].filter((n) => n.cards.every((c) => c.deckId === id)).length,
      closedNoteCount: [...notes].filter((n) => n.cards.every((c) => below.has(c.deckId))).length,
    };
  };
  const leaf = (name: string) => name.split('::').at(-1)!;

  return {
    /** The whole tree, the author's presets and the note types (`anki_deck_tree()` and its tables). */
    tree(): AnkiCatalog {
      return {
        decks: bundle.ankiDecks.map((d) => ({
          id: d.id,
          name: d.name,
          parentId: d.parentId,
          preset: d.preset,
          semester: d.semester,
          courseId: d.courseId,
          assessmentId: d.assessmentId,
          ...stats(d.id),
          ...own(d.id),
        })),
        presets: bundle.ankiPresets.map((p) => ({ name: p.name, config: p.config })),
        noteTypes: bundle.ankiNoteTypes.map((t) => ({
          id: t.id,
          name: t.name,
          kind: t.kind,
          occlusion: t.occlusion,
          fields: t.fields,
          templates: t.templates.map((x) => x.name),
          sortField: t.sortField,
        })),
      };
    },

    /** Every note for the browser (`anki_browse_notes()`). */
    browse(): BrowseData {
      return {
        notes: [...bundle.ankiNotes]
          .sort((a, b) => compareCodes(a.code, b.code) || compare(a.guid, b.guid))
          .map((n) => ({
            guid: n.guid,
            noteTypeId: n.noteTypeId,
            tags: n.tags,
            code: n.code,
            version: n.version,
            createdAt: n.createdAt,
            fields: (noteTypes.get(n.noteTypeId)?.fields ?? []).map((f) => plainText(n.fields[f])),
            sortField: [...n.cards].sort((a, b) => a.ord - b.ord)[0]?.sortField ?? '',
            cards: [...n.cards]
              .sort((a, b) => a.ord - b.ord)
              .map((c) => ({ ord: c.ord, deckId: c.deckId })),
          })),
      };
    },

    deck(id: string): DeckDetail | null {
      const d = decks.get(id);
      if (!d) return null;
      const tree = subtree(id);
      const ids = new Set(tree.map((x) => x.id));
      const subdecks = tree
        .filter((x) => x.depth > 0)
        .map((x) => ({ ...x, deck: decks.get(x.id)! }))
        .sort((a, b) => a.depth - b.depth || compare(a.deck.name, b.deck.name))
        .map(({ deck }) => ({
          id: deck.id,
          name: leaf(deck.name),
          parentId: deck.parentId,
          preset: deck.preset,
          cardCount: stats(deck.id).cardCount,
        }));
      const list: CardSummary[] = cards
        .filter((c) => ids.has(c.card.deckId))
        .sort(
          (a, b) =>
            compareCodes(a.note.code, b.note.code) ||
            compare(a.note.guid, b.note.guid) ||
            a.card.ord - b.card.ord,
        )
        .map(({ note, card, type }) => ({
          noteGuid: note.guid,
          ord: card.ord,
          deckId: card.deckId,
          code: note.code,
          version: note.version,
          kind: kindOf(type),
          text: card.sortField,
        }));
      return {
        id: d.id,
        name: leaf(d.name),
        fullName: d.name,
        description: d.description,
        courseId: d.courseId,
        assessmentId: d.assessmentId,
        preset: d.preset,
        ...stats(d.id),
        subdecks,
        cards: list,
        presets: bundle.ankiPresets.map((p) => ({ name: p.name, config: p.config })),
      };
    },

    card(noteGuid: string, ord: number): CardDetail | null {
      const found = cards.find((c) => c.note.guid === noteGuid && c.card.ord === ord);
      if (!found) return null;
      const { note, card, type } = found;
      return {
        noteGuid,
        ord,
        deckId: card.deckId,
        code: note.code,
        version: note.version,
        kind: kindOf(type),
        front: card.frontHtml,
        back: card.backHtml,
        css: type?.css ?? '',
      };
    },
  };
}

export function kindOf(type: Pick<AnkiNoteTypeRecord, 'kind' | 'occlusion'> | undefined): CardKind {
  if (type?.occlusion) return 'occlusion';
  return type?.kind === 'cloze' ? 'cloze' : 'basic';
}

/** Byte order, like Postgres' «C» collation for these names and codes. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Codes first (nulls last), like `order by code nulls last`. */
const compareCodes = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : compare(a, b);

/** A field's HTML as one line of plain text, as `anki_plain_text()` of the content database. */
export const plainText = ankiPlainText;
