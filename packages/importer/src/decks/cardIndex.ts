// Builds the card browser's indexes from a bundle's notes: per assessment, each note's kind, topic, front and back as
// short plain text, its thumbnail and origin, in the content database's order.
import { ankiPlainText } from '@qv/html/text';
import { CARD_INDEX_VERSION, ORIGIN_TAGS, thumbKeyOf } from '@qv/schema';
import type {
  AnkiDeckRecord,
  AnkiNoteTypeRecord,
  CardIndex,
  CardIndexKind,
  CardIndexNote,
  CardOrigin,
  ImportedAnkiNote,
} from '@qv/schema';

const ROW_TEXT_MAX = 240;

const short = (text: string) =>
  text.length <= ROW_TEXT_MAX ? text : `${text.slice(0, ROW_TEXT_MAX - 1).trimEnd()}…`;

function first(fields: Record<string, string>, names: readonly string[]): string {
  for (const n of names) if (n in fields) return fields[n] ?? '';
  return '';
}

/** A photo note has a question image, an answer image and the name («Etiqueta»). */
function cardIndexKind(
  type: Pick<AnkiNoteTypeRecord, 'kind' | 'occlusion' | 'fields'>,
): CardIndexKind {
  if (type.occlusion) return 'occlusion';
  if (type.kind === 'cloze') return 'cloze';
  const f = new Set(type.fields);
  return f.has('Pregunta') && f.has('Respuesta') && f.has('Etiqueta') ? 'photo' : 'basic';
}

function cardOrigins(tags: readonly string[]): CardOrigin[] {
  const lower = tags.map((t) => t.toLowerCase());
  return ORIGIN_TAGS.filter((o) => lower.some((t) => t === o || t.startsWith(`${o}::`)));
}

const occlusionShapes = (field: string) => (field.match(/image-occlusion:/g) ?? []).length;

/** The browser's order: by code (`collate "C"`, codes first), then guid. */
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

type IndexInput = {
  noteTypes: readonly AnkiNoteTypeRecord[];
  decks: readonly Pick<AnkiDeckRecord, 'id' | 'assessmentId'>[];
  notes: readonly ImportedAnkiNote[];
  assessments?: readonly string[];
};

/** The text a row of the list shows for a note: its topic, its front and its back, by the kind of the note. */
function rowText(kind: CardIndexKind, raw: Record<string, string>) {
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
  return { topic, front: short(ankiPlainText(front)), back: short(ankiPlainText(back)) };
}

/** The row of a note in the index of one assessment; `mine` are its cards that are in that assessment's decks. */
function indexNote(
  type: AnkiNoteTypeRecord,
  note: ImportedAnkiNote,
  cards: ImportedAnkiNote['cards'],
  mine: ImportedAnkiNote['cards'],
): CardIndexNote {
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
  return {
    guid: note.guid,
    noteTypeId: note.noteTypeId,
    tags: note.tags,
    code: note.code,
    version: note.version,
    createdAt: note.createdAt,
    // The occlusion's shapes are coordinates: hundreds of characters a note that nobody searches.
    fields: type.fields.map((name) => (name === occlusionField ? '' : ankiPlainText(raw[name]))),
    sortField: cards[0]?.sortField ?? '',
    cards: mine.map((c) => ({ ord: c.ord, deckId: c.deckId })),
    kind,
    ...rowText(kind, raw),
    thumb: imageKey ? thumbKeyOf(imageKey) : null,
    labels: occlusionField === null ? 0 : occlusionShapes(raw[occlusionField] ?? ''),
    origin: cardOrigins(note.tags),
  };
}

/** The rows of every assessment the notes have cards in (limited to `input.assessments` when it is given). */
function rowsByAssessment(input: IndexInput): Map<string, CardIndexNote[]> {
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
      const list = byAssessment.get(assessmentId) ?? [];
      list.push(indexNote(type, note, cards, mine));
      byAssessment.set(assessmentId, list);
    }
  }
  return byAssessment;
}

export function buildCardIndexes(input: IndexInput): CardIndex[] {
  return [...rowsByAssessment(input)]
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
