// Zod schemas of the Anki content (deck tree, note types, notes and cards) as the importer stores them and the API
// serves them. A card is identified by (note guid, ord).
import { z } from 'zod';

export const DeckId = z.string().regex(/^\d{1,20}$/, 'id de mazo inválido');

/** Anki's base91 alphabet has «/», «%», «&»… */
export const NoteGuid = z.string().regex(/^[\x21-\x7e]{1,64}$/, 'guid de nota inválido');

export const CardKind = z.enum(['basic', 'cloze', 'occlusion']);
export type CardKind = z.infer<typeof CardKind>;

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

/** URL segments unique among siblings, in the given order; a word the URLs use takes a suffix too. */
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
const RESERVED = new Set(['study', 'browse', 'options', 'anki', 'cards']);

export const ROOT_DECK_NAME = '() Medicina UCH';

export const AnkiTreeDeck = z.object({
  id: DeckId,
  name: z.string().min(1),
  parentId: DeckId.nullable(),
  preset: z.string().nullable(),
  semester: z.number().int().min(1).max(14).nullable(),
  courseId: z.string().nullable(),
  assessmentId: z.string().nullable(),
  noteCount: z.number().int().nonnegative(),
  cardCount: z.number().int().nonnegative(),
  // Notes with a card directly in the deck; with every card directly in it; and with a card directly in it and every
  // card in it or below it. The home page counts new cards with them.
  ownNoteCount: z.number().int().nonnegative().optional(),
  exclusiveNoteCount: z.number().int().nonnegative().optional(),
  closedNoteCount: z.number().int().nonnegative().optional(),
});
export type AnkiTreeDeck = z.infer<typeof AnkiTreeDeck>;

export const NoteTypeSummary = z.object({
  id: z.string().regex(/^-?\d{1,20}$/),
  name: z.string(),
  kind: z.enum(['normal', 'cloze']),
  occlusion: z.boolean(),
  fields: z.array(z.string()),
  templates: z.array(z.string()),
  sortField: z.number().int().nonnegative(),
});
export type NoteTypeSummary = z.infer<typeof NoteTypeSummary>;

const SubdeckSummary = z.object({
  id: DeckId,
  name: z.string().min(1),
  parentId: DeckId.nullable(),
  preset: z.string().nullable(),
  cardCount: z.number().int().nonnegative(),
});
type SubdeckSummary = z.infer<typeof SubdeckSummary>;

export const CardSummary = z.object({
  noteGuid: NoteGuid,
  ord: z.number().int().nonnegative(),
  deckId: DeckId,
  code: z.string().nullable(),
  version: z.number().int().positive().nullable(),
  kind: CardKind,
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
  fullName: z.string().min(1),
  description: z.string(),
  courseId: z.string().nullable(),
  assessmentId: z.string().nullable(),
  preset: z.string().nullable(),
  noteCount: z.number().int().nonnegative(),
  cardCount: z.number().int().nonnegative(),
  subdecks: z.array(SubdeckSummary),
  cards: z.array(CardSummary),
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
  front: z.string(),
  back: z.string(),
  css: z.string(),
});
export type CardDetail = z.infer<typeof CardDetail>;

export const AnkiNoteTypeRecord = z.object({
  id: z.string().regex(/^-?\d{1,20}$/),
  name: z.string(),
  kind: z.enum(['normal', 'cloze']),
  occlusion: z.boolean(),
  fields: z.array(z.string()),
  templates: z.array(z.object({ name: z.string(), qfmt: z.string(), afmt: z.string() })),
  css: z.string(),
  sortField: z.number().int().nonnegative(),
});
export type AnkiNoteTypeRecord = z.infer<typeof AnkiNoteTypeRecord>;

export const AnkiPresetRecord = z.object({
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});
export type AnkiPresetRecord = z.infer<typeof AnkiPresetRecord>;

export const AnkiDeckRecord = z.object({
  id: DeckId,
  name: z.string().min(1),
  description: z.string(),
  parentId: DeckId.nullable(),
  /** Older bundles have no `semester`: their decks were all inside an assessment. */
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
  fields: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
  code: z.string().nullable(),
  version: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime({ offset: true }).nullable().default(null),
  cards: z.array(ImportedAnkiCard),
  hash: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
  media: z.array(z.string()),
});
export type ImportedAnkiNote = z.infer<typeof ImportedAnkiNote>;

export function parseCardCode(text: string): { code: string; version: number } | null {
  const m = /^\s*([A-Z]+(?:-[A-Z0-9]+)+)\.(\d+)\s*$/.exec(text.replace(/<[^>]*>/g, ''));
  return m ? { code: m[1]!, version: Number(m[2]) } : null;
}

export const BrowseNote = z.object({
  guid: NoteGuid,
  noteTypeId: z.string(),
  tags: z.array(z.string()),
  code: z.string().nullable(),
  version: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime({ offset: true }).nullable(),
  fields: z.array(z.string()),
  sortField: z.string(),
  cards: z.array(z.object({ ord: z.number().int().nonnegative(), deckId: DeckId })),
});
export type BrowseNote = z.infer<typeof BrowseNote>;

export const BrowseData = z.object({ notes: z.array(BrowseNote) });
export type BrowseData = z.infer<typeof BrowseData>;

/** `deckId: null`: the card was taken out. */
export const CardChange = z.object({
  noteGuid: NoteGuid,
  ord: z.number().int().nonnegative(),
  deckId: DeckId.nullable(),
});
export type CardChange = z.infer<typeof CardChange>;

export const CardChanges = z.object({
  changes: z.array(CardChange),
  next: z.number().int().nonnegative(),
  latest: z.number().int().nonnegative(),
  more: z.boolean(),
});
export type CardChanges = z.infer<typeof CardChanges>;
