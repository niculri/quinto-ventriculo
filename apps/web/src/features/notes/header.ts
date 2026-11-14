// The texts of an article's header: the line under the title, its code with the version, and its dates.

import type { Note, NoteHeader, NoteKind } from '@qv/schema';
import { formatDate, formatDay } from '../../shared/lib/dates';

export const KIND_NAMES: Record<NoteKind, string> = {
  lecture: 'Clase',
  seminar: 'Seminario',
  practical: 'Práctico',
  summary: 'Resumen',
};

/** «otoño» is the first semester of the year and «primavera» the second (Chile). */
const TERMS = { autumn: 'otoño', spring: 'primavera' } as const;

function noteLabel(kind: NoteKind, header: NoteHeader): string | null {
  if (header.baseFor) return `Apunte base para la clase ${header.baseFor} en adelante`;
  if (header.number) return `${KIND_NAMES[kind]} ${header.number}`;
  return null;
}

function termLabel(header: NoteHeader): string {
  return `Semestre de ${TERMS[header.term]} ${header.year}`;
}

export function headerParts(kind: NoteKind, header: NoteHeader): string[] {
  return [
    noteLabel(kind, header),
    header.lecturer ?? null,
    termLabel(header),
    header.institution ?? null,
  ].filter((p): p is string => !!p);
}

export function versionedCode(note: Pick<Note, 'id' | 'code' | 'version'>): string {
  return note.code ? `${note.code}${note.version ? `.${note.version}` : ''}` : note.id;
}

/** A note without a version is from before the articles: its PDF's creation date and its last change. */
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
