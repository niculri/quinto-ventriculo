import type { Note, NoteHeader, NoteKind } from '@qv/schema';
import { formatDate, formatDay } from '../../lib/dates';

export const KIND_NAMES: Record<NoteKind, string> = {
  lecture: 'Clase',
  seminar: 'Seminario',
  practical: 'Práctico',
  summary: 'Resumen',
};

/** «otoño» is the first semester of the year and «primavera» the second (Chile). */
const TERMS = { autumn: 'otoño', spring: 'primavera' } as const;

/** «Clase 8», «Seminario 5», «Apunte base para la clase 8 en adelante»; null if it has no number. */
export function noteLabel(kind: NoteKind, header: NoteHeader): string | null {
  if (header.baseFor) return `Apunte base para la clase ${header.baseFor} en adelante`;
  if (header.number) return `${KIND_NAMES[kind]} ${header.number}`;
  return null;
}

/** «Semestre de primavera 2026». */
export function termLabel(header: NoteHeader): string {
  return `Semestre de ${TERMS[header.term]} ${header.year}`;
}

/**
 * The line under an article's title: «Clase 8 · Dra. Ana Prueba D. · Semestre de primavera 2026 · ICBM,
 * Universidad de Chile»; for a seminar, «Seminario 5 · Semestre de primavera 2026».
 */
export function headerParts(kind: NoteKind, header: NoteHeader): string[] {
  return [
    noteLabel(kind, header),
    header.lecturer ?? null,
    termLabel(header),
    header.institution ?? null,
  ].filter((p): p is string => !!p);
}

/** «QV-BC-C2-08.2»: the web code with its version (without a version, the note's id). */
export function versionedCode(note: Pick<Note, 'id' | 'code' | 'version'>): string {
  return note.code ? `${note.code}${note.version ? `.${note.version}` : ''}` : note.id;
}

/**
 * «Creado el …» and, from version 2, «actualizado el …» (as the cards' footer). A note from before the
 * articles: its PDF's creation date and its last change.
 */
export function noteDates(
  note: Pick<Note, 'version' | 'publishedAt' | 'versionAt' | 'createdOn' | 'updatedAt'>,
): string[] {
  if (note.version && note.publishedAt) {
    const dates = [`Creado el ${formatDate(note.publishedAt)}`];
    if (note.version > 1 && note.versionAt)
      dates.push(`Actualizado el ${formatDate(note.versionAt)}`);
    return dates;
  }
  return [
    ...(note.createdOn ? [`Creado el ${formatDay(note.createdOn)}`] : []),
    `Actualizado el ${formatDate(note.updatedAt)}`,
  ];
}
