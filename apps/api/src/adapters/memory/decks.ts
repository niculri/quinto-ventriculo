// The Anki decks of an importer bundle, answered like the content database's SQL functions.
import type {
  AnkiCatalog,
  AnkiNoteTypeRecord,
  CardDetail,
  CardKind,
  CardSummary,
  ContentBundle,
  DeckDetail,
} from '@qv/schema';

type BundleCard = {
  note: ContentBundle['ankiNotes'][number];
  card: ContentBundle['ankiNotes'][number]['cards'][number];
  type: AnkiNoteTypeRecord | undefined;
};

interface DeckIndex {
  decks: Map<string, ContentBundle['ankiDecks'][number]>;
  children: Map<string, string[]>;
  cards: BundleCard[];
}

function indexOf(bundle: ContentBundle): DeckIndex {
  const children = new Map<string, string[]>();
  for (const d of bundle.ankiDecks) {
    if (d.parentId) children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
  }
  const noteTypes = new Map(bundle.ankiNoteTypes.map((t) => [t.id, t]));
  return {
    decks: new Map(bundle.ankiDecks.map((d) => [d.id, d])),
    children,
    cards: bundle.ankiNotes.flatMap((note) =>
      note.cards.map((card) => ({ note, card, type: noteTypes.get(note.noteTypeId) })),
    ),
  };
}

const subtree = (index: DeckIndex, id: string): { id: string; depth: number }[] => {
  const out = [{ id, depth: 0 }];
  for (const node of out) {
    for (const c of index.children.get(node.id) ?? []) out.push({ id: c, depth: node.depth + 1 });
  }
  return out;
};

const stats = (index: DeckIndex, id: string) => {
  const ids = new Set(subtree(index, id).map((x) => x.id));
  const inside = index.cards.filter((c) => ids.has(c.card.deckId));
  return { noteCount: new Set(inside.map((c) => c.note.guid)).size, cardCount: inside.length };
};

const own = (index: DeckIndex, id: string) => {
  const notes = new Set(index.cards.filter((c) => c.card.deckId === id).map((c) => c.note));
  const below = new Set(subtree(index, id).map((x) => x.id));
  return {
    ownNoteCount: notes.size,
    exclusiveNoteCount: [...notes].filter((n) => n.cards.every((c) => c.deckId === id)).length,
    closedNoteCount: [...notes].filter((n) => n.cards.every((c) => below.has(c.deckId))).length,
  };
};

const leaf = (name: string) => name.split('::').at(-1)!;

function treeOf(bundle: ContentBundle, index: DeckIndex): AnkiCatalog {
  return {
    decks: bundle.ankiDecks.map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      preset: d.preset,
      semester: d.semester,
      courseId: d.courseId,
      assessmentId: d.assessmentId,
      ...stats(index, d.id),
      ...own(index, d.id),
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
}

function deckOf(bundle: ContentBundle, index: DeckIndex, id: string): DeckDetail | null {
  const d = index.decks.get(id);
  if (!d?.courseId) return null;
  const tree = subtree(index, id);
  const ids = new Set(tree.map((x) => x.id));
  const subdecks = tree
    .filter((x) => x.depth > 0)
    .map((x) => ({ ...x, deck: index.decks.get(x.id)! }))
    .sort((a, b) => a.depth - b.depth || compare(a.deck.name, b.deck.name))
    .map(({ deck }) => ({
      id: deck.id,
      name: leaf(deck.name),
      parentId: deck.parentId,
      preset: deck.preset,
      cardCount: stats(index, deck.id).cardCount,
    }));
  const list: CardSummary[] = index.cards
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
    ...stats(index, d.id),
    subdecks,
    cards: list,
    presets: bundle.ankiPresets.map((p) => ({ name: p.name, config: p.config })),
  };
}

function cardOf(index: DeckIndex, noteGuid: string, ord: number): CardDetail | null {
  const found = index.cards.find((c) => c.note.guid === noteGuid && c.card.ord === ord);
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
}

export function memoryDecks(bundle: ContentBundle) {
  const index = indexOf(bundle);
  return {
    courseOf: (id: string): string | null => index.decks.get(id)?.courseId ?? null,
    tree: () => treeOf(bundle, index),
    deck: (id: string) => deckOf(bundle, index, id),
    card: (noteGuid: string, ord: number) => cardOf(index, noteGuid, ord),
  };
}

function kindOf(type: Pick<AnkiNoteTypeRecord, 'kind' | 'occlusion'> | undefined): CardKind {
  if (type?.occlusion) return 'occlusion';
  return type?.kind === 'cloze' ? 'cloze' : 'basic';
}

/** Byte order, like Postgres' «C» collation. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const compareCodes = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : compare(a, b);
