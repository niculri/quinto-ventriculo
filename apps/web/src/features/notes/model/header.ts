// The texts of an article's header: the line under the title, its code with the version, and its dates.

import type { Note, NoteHeader, NoteKind } from '@qv/schema';
import { formatDate, formatDay } from '../../../shared/lib/dates';
import { kindStrings } from '../kinds.strings';
import { noteStrings } from '../strings';

const s = noteStrings.header;

function noteLabel(kind: NoteKind, header: NoteHeader): string | null {
  if (header.baseFor) return s.baseFor(header.baseFor);
  if (header.number) return `${kindStrings[kind]} ${header.number}`;
  return null;
}

/** «otoño» is the first semester of the year and «primavera» the second (Chile). */
function termLabel(header: NoteHeader): string {
  return s.term(s.terms[header.term], header.year);
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
    const dates = [s.created(formatDate(note.publishedAt))];
    if (note.version > 1 && note.versionAt) dates.push(s.updated(formatDate(note.versionAt)));
    return dates;
  }
  return [
    ...(note.createdOn ? [s.created(formatDay(note.createdOn))] : []),
    s.updated(formatDate(note.updatedAt)),
  ];
}
