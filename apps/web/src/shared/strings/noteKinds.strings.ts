// The name of each kind of note, which the lists of an assessment also show.
import type { NoteKind } from '@qv/schema';

export const kindStrings: Record<NoteKind, string> = {
  lecture: 'Clase',
  seminar: 'Seminario',
  practical: 'Práctico',
  summary: 'Resumen',
};
