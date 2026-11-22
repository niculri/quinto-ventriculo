// The line under a note in an assessment's list: base for which lecture, lecturer, year, subtitle and update.
import type { NoteSummary } from '@qv/schema';
import { formatDate } from '../../../shared/lib/dates';
import { noteLineStrings as s } from './strings/noteLine.strings';

export function noteLine(note: NoteSummary): string {
  const h = note.header;
  return [
    h?.baseFor ? s.baseFor(h.baseFor) : null,
    h?.lecturer ?? null,
    h ? String(h.year) : null,
    note.subtitle ?? null,
    note.version && note.version > 1 && note.versionAt
      ? s.updated(formatDate(note.versionAt))
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
