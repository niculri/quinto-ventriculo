import { z } from 'zod';

/**
 * Anki flashcards: decks, note types, notes and cards as Anki has them. Only the author's (common to
 * everybody); nobody uploads cards. A card's identity is (note guid, ord): the progress of v1.2 hangs on it.
 */

/** Anki deck id (a 64-bit integer, as text). */
export const DeckId = z.string().regex(/^\d{1,20}$/, 'id de mazo inválido');

/** Anki note guid: printable ASCII without spaces (Anki's base91 alphabet has «/», «%», «&»…). */
export const NoteGuid = z.string().regex(/^[\x21-\x7e]{1,64}$/, 'guid de nota inválido');

export const CardKind = z.enum(['basic', 'cloze', 'occlusion']);
export type CardKind = z.infer<typeof CardKind>;

/** Readable slug for URLs, from a deck name: «01 - Columna vertebral» → «01-columna-vertebral». */
export function deckSlug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mazo'
  );
}

/**
 * The slug of each deck for its URL segment, unique among its siblings (in the order given: «gymkana», then
 * «gymkana-2»). A slug that is a word of the URLs («study», «browse», «options») takes a suffix too.
 */
export function deckSlugs(decks: readonly { id: string; name: string; parentId: string | null }[]) {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const d of decks) {
    const base = deckSlug(d.name.split('::').at(-1)!);
    let slug = base;
    for (let i = 2; RESERVED.has(slug) || taken.has(`${d.parentId}/${slug}`); i++) {
      slug = `${base}-${i}`;
    }
    taken.add(`${d.parentId}/${slug}`);
    out.set(d.id, slug);
  }
  return out;
}
const RESERVED = new Set(['study', 'browse', 'options', 'anki']);

/** The root of every published deck («() Medicina UCH»): the `/anki` page. */
export const ROOT_DECK_NAME = '() Medicina UCH';

/**
 * A deck of the whole tree, as Anki's deck list has it: from the root («() Medicina UCH») through the
 * semester, the course and the assessment down to the decks with cards and their «Extras». The importer
 * creates the parents the packages do not bring (with an id derived from the full name).
 */
export const AnkiTreeDeck = z.object({
  id: DeckId,
  /** Full Anki name, «::» between levels. */
  name: z.string().min(1),
  parentId: DeckId.nullable(),
  /** Name of the author's preset (deck options): «Default», «Extras»… */
  preset: z.string().nullable(),
  /** The semester, course and assessment the deck is in (null above them: the root, a semester…). */
  semester: z.number().int().min(1).max(14).nullable(),
  courseId: z.string().nullable(),
  assessmentId: z.string().nullable(),
  /** Notes and cards of the deck and its subdecks. */
  noteCount: z.number().int().nonnegative(),
  cardCount: z.number().int().nonnegative(),
});
export type AnkiTreeDeck = z.infer<typeof AnkiTreeDeck>;

/** A note type, as the browser needs it (no templates or CSS). */
export const NoteTypeSummary = z.object({
  id: z.string().regex(/^-?\d{1,20}$/),
  name: z.string(),
  kind: z.enum(['normal', 'cloze']),
  occlusion: z.boolean(),
  fields: z.array(z.string()),
  /** Template names, by ord. */
  templates: z.array(z.string()),
  sortField: z.number().int().nonnegative(),
});
export type NoteTypeSummary = z.infer<typeof NoteTypeSummary>;

export const SubdeckSummary = z.object({
  id: DeckId,
  name: z.string().min(1),
  parentId: DeckId.nullable(),
  /** Name of the preset (deck options): «Default», «Extras»… */
  preset: z.string().nullable(),
  /** Cards of this deck and its subdecks. */
  cardCount: z.number().int().nonnegative(),
});
export type SubdeckSummary = z.infer<typeof SubdeckSummary>;

export const CardSummary = z.object({
  noteGuid: NoteGuid,
  ord: z.number().int().nonnegative(),
  deckId: DeckId,
  /** Code shown on the card: «T-A1-S3-01-047» (without the version). */
  code: z.string().nullable(),
  version: z.number().int().positive().nullable(),
  kind: CardKind,
  /** One line of text of the note (sort field without HTML), for the list and the filter. */
  text: z.string(),
});
export type CardSummary = z.infer<typeof CardSummary>;

export const AuthorPreset = z.object({
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});
export type AuthorPreset = z.infer<typeof AuthorPreset>;

export const DeckDetail = z.object({
  id: DeckId,
  name: z.string().min(1),
  /** Full Anki name («() Medicina UCH::…::01 - Columna vertebral»). */
  fullName: z.string().min(1),
  description: z.string(),
  courseId: z.string().nullable(),
  assessmentId: z.string().nullable(),
  preset: z.string().nullable(),
  noteCount: z.number().int().nonnegative(),
  cardCount: z.number().int().nonnegative(),
  /** Its subdecks at every level (parents before children). */
  subdecks: z.array(SubdeckSummary),
  /** The cards of the deck and its subdecks, by code and ord. */
  cards: z.array(CardSummary),
  /**
   * The author's presets (deck options) as Anki exported them: each deck and subdeck uses the one named in
   * its `preset` unless the user chose another (v1.2's scheduler).
   */
  presets: z.array(AuthorPreset),
});
export type DeckDetail = z.infer<typeof DeckDetail>;

export const CardDetail = z.object({
  noteGuid: NoteGuid,
  ord: z.number().int().nonnegative(),
  deckId: DeckId,
  code: z.string().nullable(),
  version: z.number().int().positive().nullable(),
  kind: CardKind,
  /** Front and back as Anki renders them, sanitized; the API resolves the images' `src`. */
  front: z.string(),
  back: z.string(),
  /** CSS of the note type, for the card's Shadow DOM. */
  css: z.string(),
});
export type CardDetail = z.infer<typeof CardDetail>;

// What the importer produces and the content database stores.

export const AnkiNoteTypeRecord = z.object({
  id: z.string().regex(/^-?\d{1,20}$/),
  name: z.string(),
  kind: z.enum(['normal', 'cloze']),
  /** Anki's Image Occlusion. */
  occlusion: z.boolean(),
  fields: z.array(z.string()),
  templates: z.array(z.object({ name: z.string(), qfmt: z.string(), afmt: z.string() })),
  css: z.string(),
  sortField: z.number().int().nonnegative(),
});
export type AnkiNoteTypeRecord = z.infer<typeof AnkiNoteTypeRecord>;

export const AnkiPresetRecord = z.object({
  name: z.string().min(1),
  /** The whole configuration as Anki exports it (for v1.2's scheduler). */
  config: z.record(z.string(), z.unknown()),
});
export type AnkiPresetRecord = z.infer<typeof AnkiPresetRecord>;

export const AnkiDeckRecord = z.object({
  id: DeckId,
  /** Full Anki name. */
  name: z.string().min(1),
  description: z.string(),
  parentId: DeckId.nullable(),
  /**
   * Null above the level: the root has none; a semester, only `semester`; a course, no assessment.
   * (A bundle from before v1.3 has no `semester`: its decks were all inside an assessment.)
   */
  semester: z.number().int().min(1).max(14).nullable().default(null),
  courseId: z.string().nullable(),
  assessmentId: z.string().nullable(),
  preset: z.string().nullable(),
  position: z.number().int(),
});
export type AnkiDeckRecord = z.infer<typeof AnkiDeckRecord>;

export const ImportedAnkiCard = z.object({
  ord: z.number().int().nonnegative(),
  deckId: DeckId,
  frontHtml: z.string(),
  backHtml: z.string(),
  sortField: z.string(),
});
export type ImportedAnkiCard = z.infer<typeof ImportedAnkiCard>;

export const ImportedAnkiNote = z.object({
  guid: NoteGuid,
  noteTypeId: z.string(),
  /** Field name → value, as in Anki (with the original media names). */
  fields: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
  code: z.string().nullable(),
  version: z.number().int().positive().nullable(),
  /** When the author created the note (Anki's note id, ms): the browser's «Creada». */
  createdAt: z.iso.datetime({ offset: true }).nullable().default(null),
  cards: z.array(ImportedAnkiCard),
  /** sha256 of the imported note (with its rendered cards): unchanged → not rewritten. */
  hash: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
  /** Keys of the images of its cards in the store (R2). */
  media: z.array(z.string()),
});
export type ImportedAnkiNote = z.infer<typeof ImportedAnkiNote>;

/** «T-A1-S3-01-047.3» → code «T-A1-S3-01-047» and version 3. */
export function parseCardCode(text: string): { code: string; version: number } | null {
  const m = /^\s*([A-Z]+(?:-[A-Z0-9]+)+)\.(\d+)\s*$/.exec(text.replace(/<[^>]*>/g, ''));
  return m ? { code: m[1]!, version: Number(m[2]) } : null;
}

/** A note for the browser: plain-text fields (no HTML) and its cards. */
export const BrowseNote = z.object({
  guid: NoteGuid,
  noteTypeId: z.string(),
  tags: z.array(z.string()),
  code: z.string().nullable(),
  version: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime({ offset: true }).nullable(),
  /** Each field as plain text, in the note type's order. */
  fields: z.array(z.string()),
  /** The sort field as the list shows it (Anki's). */
  sortField: z.string(),
  cards: z.array(z.object({ ord: z.number().int().nonnegative(), deckId: DeckId })),
});
export type BrowseNote = z.infer<typeof BrowseNote>;

/** `GET /api/anki/notes`: every published note, light (the card HTML comes one by one). */
export const BrowseData = z.object({ notes: z.array(BrowseNote) });
export type BrowseData = z.infer<typeof BrowseData>;

/** A card that moved to another deck (`deckId`) or was taken out (`deckId: null`), as it is now. */
export const CardChange = z.object({
  noteGuid: NoteGuid,
  ord: z.number().int().nonnegative(),
  deckId: DeckId.nullable(),
});
export type CardChange = z.infer<typeof CardChange>;

/**
 * `GET /api/anki/card-changes?since=N`: the cards that moved or were taken out after the change N, in order (each
 * once, as it is now). `next` is where the next page starts; `latest`, the newest change of all; `more`, there is
 * another page.
 */
export const CardChanges = z.object({
  changes: z.array(CardChange),
  next: z.number().int().nonnegative(),
  latest: z.number().int().nonnegative(),
  more: z.boolean(),
});
export type CardChanges = z.infer<typeof CardChanges>;
