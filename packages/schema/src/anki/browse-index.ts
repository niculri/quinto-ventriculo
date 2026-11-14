// The card browser's index: one file per assessment, named by its content, that the importer writes to the image
// store and the API serves behind the session, so opening the browser asks nothing of the content database.
import { z } from 'zod';
import { BrowseNote, NoteTypeSummary } from './flashcards';

/** Bumped when the shape of the file changes: a web that does not know it asks for it again after a reload. */
export const CARD_INDEX_VERSION = 1;

export const CardIndexKind = z.enum(['basic', 'cloze', 'occlusion', 'photo']);
export type CardIndexKind = z.infer<typeof CardIndexKind>;

export const ORIGIN_TAGS = ['profe', 'control', 'clinica', 'complemento'] as const;
export const CardOrigin = z.enum(ORIGIN_TAGS);
export type CardOrigin = z.infer<typeof CardOrigin>;

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
