// The card browser's index: one file per assessment, named by its content, that the importer writes to the image
// store and the API serves behind the session, so opening the browser asks nothing of the content database.
import { z } from 'zod';
import { BrowseNote, NoteTypeSummary } from './flashcards';
import type { AnkiDeckRecord, AnkiNoteTypeRecord, ImportedAnkiNote } from './flashcards';

/** Bumped when the shape of the file changes: a web that does not know it asks for it again after a reload. */
export const CARD_INDEX_VERSION = 1;

export const CardIndexKind = z.enum(['basic', 'cloze', 'occlusion', 'photo']);
export type CardIndexKind = z.infer<typeof CardIndexKind>;

export const ORIGIN_TAGS = ['profe', 'control', 'clinica', 'complemento'] as const;
export const CardOrigin = z.enum(ORIGIN_TAGS);
export type CardOrigin = z.infer<typeof CardOrigin>;

export const ROW_TEXT_MAX = 240;

export const CardIndexNote = BrowseNote.extend({
  kind: CardIndexKind,
  topic: z.string(),
  /** A cloze keeps its holes as `{{c1::answer::hint}}`, which the list highlights. */
  front: z.string(),
  back: z.string(),
  thumb: z.string().nullable(),
  labels: z.number().int().nonnegative(),
  origin: z.array(CardOrigin),
});
export type CardIndexNote = z.infer<typeof CardIndexNote>;

export const CardIndex = z.object({
  version: z.literal(CARD_INDEX_VERSION),
  assessmentId: z.string(),
  noteTypes: z.array(NoteTypeSummary),
  notes: z.array(CardIndexNote),
});
export type CardIndex = z.infer<typeof CardIndex>;

export const CardIndexRef = z.object({
  hash: z.string().regex(/^[0-9a-f]{32}$/),
  noteCount: z.number().int().nonnegative(),
  cardCount: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});
export type CardIndexRef = z.infer<typeof CardIndexRef>;

export const CardIndexRecord = CardIndexRef.extend({ assessmentId: z.string() });
export type CardIndexRecord = z.infer<typeof CardIndexRecord>;

const ASSESSMENT_ID = /^[a-z0-9-]+\/[a-z0-9-]+$/;

export function cardIndexKey(assessmentId: string, hash: string): string {
  if (!ASSESSMENT_ID.test(assessmentId) || !/^[0-9a-f]{32}$/.test(hash)) {
    throw new Error(`Índice inválido: ${assessmentId} ${hash}`);
  }
  return `browse/${assessmentId}/${hash}.json.gz`;
}

export const cardIndexUrl = (assessmentId: string, hash: string) =>
  `/api/anki/index/${assessmentId}/${hash}`;

/** One signature covers every thumbnail under this prefix (`GET /api/anki/thumbs`). */
export const THUMB_PREFIX = 'cards/thumb/';

export function thumbKeyOf(imageKey: string): string | null {
  const m = /^cards\/([0-9a-f]{32})\.webp$/.exec(imageKey);
  return m ? `${THUMB_PREFIX}${m[1]}.webp` : null;
}

export const ThumbSignature = z.object({
  prefix: z.literal(THUMB_PREFIX),
  expires: z.number().int().positive(),
  query: z.string(),
});
export type ThumbSignature = z.infer<typeof ThumbSignature>;

/** Has to match `anki_plain_text()` of the content database. */
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

function first(fields: Record<string, string>, names: readonly string[]): string {
  for (const n of names) if (n in fields) return fields[n] ?? '';
  return '';
}

/** A photo note has a question image, an answer image and the name («Etiqueta»). */
export function cardIndexKind(
  type: Pick<AnkiNoteTypeRecord, 'kind' | 'occlusion' | 'fields'>,
): CardIndexKind {
  if (type.occlusion) return 'occlusion';
  if (type.kind === 'cloze') return 'cloze';
  const f = new Set(type.fields);
  return f.has('Pregunta') && f.has('Respuesta') && f.has('Etiqueta') ? 'photo' : 'basic';
}

export function cardOrigins(tags: readonly string[]): CardOrigin[] {
  const lower = tags.map((t) => t.toLowerCase());
  return ORIGIN_TAGS.filter((o) => lower.some((t) => t === o || t.startsWith(`${o}::`)));
}

export const occlusionShapes = (field: string) => (field.match(/image-occlusion:/g) ?? []).length;

/** The order of `anki_browse_notes()`: by code (`collate "C"`, codes first), then guid. */
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
        // The occlusion's shapes are coordinates: hundreds of characters a note that nobody searches.
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

export const cardIndexCards = (index: CardIndex) =>
  index.notes.reduce((t, n) => t + n.cards.length, 0);
