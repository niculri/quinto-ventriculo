// Note-level helpers: whether a note type is Image Occlusion, and a note's one-line text.
import { stripClozes } from './cloze';
import { htmlToTextLine } from './html';

interface NoteTypeLike {
  kind: 'normal' | 'cloze';
  templates: { qfmt: string; afmt: string }[];
  originalStockKind?: number | null;
}

export function isImageOcclusion(noteType: NoteTypeLike): boolean {
  if (noteType.originalStockKind === 6) return true;
  return (
    noteType.kind === 'cloze' &&
    noteType.templates.some((t) => t.qfmt.includes('image-occlusion-container'))
  );
}

/** An occlusion field has only shapes: then the first field with text stands for the note. */
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
