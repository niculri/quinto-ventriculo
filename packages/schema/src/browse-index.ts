import { z } from 'zod';
import { BrowseNote, NoteTypeSummary } from './flashcards';
import type { AnkiDeckRecord, AnkiNoteTypeRecord, ImportedAnkiNote } from './flashcards';

/**
 * The card browser's index (plan step 3.3, ANK-6): what the list of an assessment needs of each of its notes, in one
 * file per assessment that the importer writes to the image store (R2) when it imports, named by its content. The API
 * serves it behind the session (`GET /api/anki/index/<assessmentId>/<hash>`), so opening the browser asks nothing of
 * the content database: the catalog says which file is the current one (`AssessmentWithNotes.cardIndex`).
 */

/** Bumped when the shape of the file changes: a web that does not know it asks for it again after a reload. */
export const CARD_INDEX_VERSION = 1;

/** How a row of the list shows a note. */
export const CardIndexKind = z.enum(['basic', 'cloze', 'occlusion', 'photo']);
export type CardIndexKind = z.infer<typeof CardIndexKind>;

/** The tags that say where a card comes from, for the «Origen» filter. */
export const ORIGIN_TAGS = ['profe', 'control', 'clinica', 'complemento'] as const;
export const CardOrigin = z.enum(ORIGIN_TAGS);
export type CardOrigin = z.infer<typeof CardOrigin>;

/** The longest `front` and `back` of a row (the whole text is in `fields` and in the viewer). */
export const ROW_TEXT_MAX = 240;

/**
 * One note of the index: what `/api/anki/notes` gives of it (its fields as plain text, so that `@qv/anki-search` finds
 * the same, and only its cards of this assessment), plus what the row shows.
 */
export const CardIndexNote = BrowseNote.extend({
  kind: CardIndexKind,
  /** The «Tema» field (or «Encabezado» if the type has no «Tema»): the list groups by it. Empty if none. */
  topic: z.string(),
  /**
   * The row's question, plain and at most ROW_TEXT_MAX characters: the «Frente» of a basic note; the «Texto» of a cloze,
   * with its holes as `{{c1::answer::hint}}` (the list highlights them); the «Encabezado» of an occlusion or a photo.
   */
  front: z.string(),
  /** The row's answer, the same way: the «Reverso» of a basic note, the «Etiqueta» of a photo; empty in the others. */
  back: z.string(),
  /** The thumbnail (`cards/thumb/<hash>.webp`, 240 px wide) of an occlusion or a photo; null in the others. */
  thumb: z.string().nullable(),
  /** The shapes of an occlusion («14 rótulos»); 0 in the others. */
  labels: z.number().int().nonnegative(),
  /** The origin tags it has, in the order of ORIGIN_TAGS. */
  origin: z.array(CardOrigin),
});
export type CardIndexNote = z.infer<typeof CardIndexNote>;

export const CardIndex = z.object({
  version: z.literal(CARD_INDEX_VERSION),
  assessmentId: z.string(),
  /** The note types its notes use (for the search and the table of the advanced mode). */
  noteTypes: z.array(NoteTypeSummary),
  /** By code (as the class goes) and guid, as `/api/anki/notes`. */
  notes: z.array(CardIndexNote),
});
export type CardIndex = z.infer<typeof CardIndex>;

/** Which file is the current index of an assessment (in the catalog), and how big it is. */
export const CardIndexRef = z.object({
  /** The first 32 hex characters of the sha256 of the file's JSON. */
  hash: z.string().regex(/^[0-9a-f]{32}$/),
  noteCount: z.number().int().nonnegative(),
  cardCount: z.number().int().nonnegative(),
  /** Size of the compressed file (gzip), in bytes. */
  bytes: z.number().int().nonnegative(),
});
export type CardIndexRef = z.infer<typeof CardIndexRef>;

/** What the content database keeps of an index (`anki_browse_indexes`) and the dry-run bundle too. */
export const CardIndexRecord = CardIndexRef.extend({ assessmentId: z.string() });
export type CardIndexRecord = z.infer<typeof CardIndexRecord>;

const ASSESSMENT_ID = /^[a-z0-9-]+\/[a-z0-9-]+$/;

/** The index's key in the image store: `browse/<course>/<assessment>/<hash>.json.gz`. */
export function cardIndexKey(assessmentId: string, hash: string): string {
  if (!ASSESSMENT_ID.test(assessmentId) || !/^[0-9a-f]{32}$/.test(hash)) {
    throw new Error(`Índice inválido: ${assessmentId} ${hash}`);
  }
  return `browse/${assessmentId}/${hash}.json.gz`;
}

/** Where the web asks for it. */
export const cardIndexUrl = (assessmentId: string, hash: string) =>
  `/api/anki/index/${assessmentId}/${hash}`;

/** The thumbnails' prefix in the store: one signature for all of them (`GET /api/anki/thumbs`). */
export const THUMB_PREFIX = 'cards/thumb/';

/** `cards/<hash>.webp` → `cards/thumb/<hash>.webp` (the same hash: it is made from that image). Null: not a card's. */
export function thumbKeyOf(imageKey: string): string | null {
  const m = /^cards\/([0-9a-f]{32})\.webp$/.exec(imageKey);
  return m ? `${THUMB_PREFIX}${m[1]}.webp` : null;
}

/** `GET /api/anki/thumbs`: the query that signs every thumbnail until `expires` (Unix seconds). */
export const ThumbSignature = z.object({
  prefix: z.literal(THUMB_PREFIX),
  expires: z.number().int().positive(),
  /** `e=…&p=…&s=…`: a thumbnail is `/api/media/<key>?<query>`. */
  query: z.string(),
});
export type ThumbSignature = z.infer<typeof ThumbSignature>;

/** A field's HTML as one line of plain text, as `anki_plain_text()` of the content database. */
export function ankiPlainText(html: string | undefined): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const short = (text: string) =>
  text.length <= ROW_TEXT_MAX ? text : `${text.slice(0, ROW_TEXT_MAX - 1).trimEnd()}…`;

/** The first field of these names the type has (its raw value), or ''. */
function first(fields: Record<string, string>, names: readonly string[]): string {
  for (const n of names) if (n in fields) return fields[n] ?? '';
  return '';
}

/**
 * How the list shows a note of this type: an Image Occlusion; a photo (the gymkana's «Oclusión (imagen)»: a question
 * image, an answer image and the name, «Etiqueta»); a cloze; or a basic note.
 */
export function cardIndexKind(
  type: Pick<AnkiNoteTypeRecord, 'kind' | 'occlusion' | 'fields'>,
): CardIndexKind {
  if (type.occlusion) return 'occlusion';
  if (type.kind === 'cloze') return 'cloze';
  const f = new Set(type.fields);
  return f.has('Pregunta') && f.has('Respuesta') && f.has('Etiqueta') ? 'photo' : 'basic';
}

/** The origin tags of a note (a tag counts with its children: «profe::minuto» is «profe»). */
export function cardOrigins(tags: readonly string[]): CardOrigin[] {
  const lower = tags.map((t) => t.toLowerCase());
  return ORIGIN_TAGS.filter((o) => lower.some((t) => t === o || t.startsWith(`${o}::`)));
}

/** The shapes of an occlusion field (`{{c1::image-occlusion:rect:…}}`). */
export const occlusionShapes = (field: string) => (field.match(/image-occlusion:/g) ?? []).length;

/** Anki's guid order and the code order of `anki_browse_notes()` (`collate "C"`, codes first). */
const byCode = (
  a: { code: string | null; guid: string },
  b: { code: string | null; guid: string },
) => {
  if (a.code !== b.code) {
    if (a.code === null) return 1;
    if (b.code === null) return -1;
    return a.code < b.code ? -1 : 1;
  }
  return a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0;
};

/**
 * The index of every assessment the notes have cards in (or only `assessments`), from what the importer imports: the
 * note types, the decks (to know each card's assessment) and the notes, as they will be in the content database. Pure:
 * the importer hashes, compresses and uploads it. An assessment without cards has no index.
 */
export function buildCardIndexes(input: {
  noteTypes: readonly AnkiNoteTypeRecord[];
  decks: readonly Pick<AnkiDeckRecord, 'id' | 'assessmentId'>[];
  notes: readonly ImportedAnkiNote[];
  assessments?: readonly string[];
}): CardIndex[] {
  const types = new Map(input.noteTypes.map((t) => [t.id, t]));
  const assessmentOf = new Map(input.decks.map((d) => [d.id, d.assessmentId]));
  const only = input.assessments ? new Set(input.assessments) : null;
  const byAssessment = new Map<string, CardIndexNote[]>();
  for (const note of input.notes) {
    const type = types.get(note.noteTypeId);
    if (!type) continue;
    const cards = [...note.cards].sort((a, b) => a.ord - b.ord);
    const assessments = new Set(cards.map((c) => assessmentOf.get(c.deckId) ?? null));
    for (const assessmentId of assessments) {
      if (assessmentId === null || (only && !only.has(assessmentId))) continue;
      const mine = cards.filter((c) => assessmentOf.get(c.deckId) === assessmentId);
      const kind = cardIndexKind(type);
      const raw = note.fields;
      const occlusionField =
        kind === 'occlusion'
          ? (type.fields.find((f) => (raw[f] ?? '').includes('image-occlusion:')) ??
            type.fields[0] ??
            '')
          : null;
      const imageKey =
        kind === 'occlusion' || kind === 'photo'
          ? (/data-media="([^"]+)"/.exec(cards[0]?.frontHtml ?? '')?.[1] ?? null)
          : null;
      const topic = ankiPlainText(first(raw, ['Tema', 'Encabezado']));
      const front =
        kind === 'basic'
          ? first(raw, ['Frente', 'Front', 'Anverso'])
          : kind === 'cloze'
            ? first(raw, ['Texto', 'Text'])
            : first(raw, ['Encabezado']);
      const back =
        kind === 'basic'
          ? first(raw, ['Reverso', 'Back'])
          : kind === 'photo'
            ? first(raw, ['Etiqueta'])
            : '';
      const list = byAssessment.get(assessmentId) ?? [];
      list.push({
        guid: note.guid,
        noteTypeId: note.noteTypeId,
        tags: note.tags,
        code: note.code,
        version: note.version,
        createdAt: note.createdAt,
        // The occlusion's shapes are coordinates, not text: hundreds of characters a note that nobody searches.
        fields: type.fields.map((name) =>
          name === occlusionField ? '' : ankiPlainText(raw[name]),
        ),
        sortField: cards[0]?.sortField ?? '',
        cards: mine.map((c) => ({ ord: c.ord, deckId: c.deckId })),
        kind,
        topic,
        front: short(ankiPlainText(front)),
        back: short(ankiPlainText(back)),
        thumb: imageKey ? thumbKeyOf(imageKey) : null,
        labels: occlusionField === null ? 0 : occlusionShapes(raw[occlusionField] ?? ''),
        origin: cardOrigins(note.tags),
      });
      byAssessment.set(assessmentId, list);
    }
  }
  return [...byAssessment]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([assessmentId, notes]) => {
      notes.sort(byCode);
      const used = new Set(notes.map((n) => n.noteTypeId));
      return {
        version: CARD_INDEX_VERSION,
        assessmentId,
        noteTypes: input.noteTypes
          .filter((t) => used.has(t.id))
          .map((t) => ({
            id: t.id,
            name: t.name,
            kind: t.kind,
            occlusion: t.occlusion,
            fields: t.fields,
            templates: t.templates.map((x) => x.name),
            sortField: t.sortField,
          })),
        notes,
      };
    });
}

/** The cards of an index (each note's cards of the assessment). */
export const cardIndexCards = (index: CardIndex) =>
  index.notes.reduce((t, n) => t + n.cards.length, 0);
