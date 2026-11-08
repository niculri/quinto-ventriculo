import { stripClozes } from './cloze';
import { htmlToTextLine } from './html';

interface NoteTypeLike {
  kind: 'normal' | 'cloze';
  templates: { qfmt: string; afmt: string }[];
  originalStockKind?: number | null;
}

/** Anki's Image Occlusion note type (stock kind 6), or a cloze type with its template. */
export function isImageOcclusion(noteType: NoteTypeLike): boolean {
  if (noteType.originalStockKind === 6) return true;
  return (
    noteType.kind === 'cloze' &&
    noteType.templates.some((t) => t.qfmt.includes('image-occlusion-container'))
  );
}

/**
 * One line of text for a note's list: its sort field (Anki's browser «Sort Field») without HTML and with the
 * clozes revealed. If that field is an occlusion (only shapes), the first field with text is used.
 */
export function noteSortText(fields: string[], sortField: number): string {
  const text = (value: string) =>
    value.includes('image-occlusion:') ? '' : htmlToTextLine(stripClozes(value));
  const first = text(fields[sortField] ?? '');
  if (first) return first;
  for (const value of fields) {
    const t = text(value);
    if (t) return t;
  }
  return '';
}
