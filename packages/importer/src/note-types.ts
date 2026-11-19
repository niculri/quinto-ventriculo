// Chooses, for each note type id, the version modified last across the packages (as Anki does when importing a
// package), and maps each note's fields to that version by name.
import type { AnkiNote, AnkiNoteType, AnkiPackage } from '@qv/anki-format';

export type NewestNoteTypes = Map<string, AnkiNoteType>;

/** Reads each package in turn and keeps only its note types, so no package stays in memory. On a tie the last wins. */
export async function newestNoteTypes(
  paths: string[],
  read: (path: string) => Promise<AnkiPackage>,
): Promise<NewestNoteTypes> {
  const newest: NewestNoteTypes = new Map();
  for (const path of paths) {
    const types = (await read(path)).collection.noteTypes;
    for (const type of types) {
      const before = newest.get(type.id);
      if (!before || type.mod >= before.mod) newest.set(type.id, type);
    }
  }
  return newest;
}

export interface RemappedNotes {
  notes: AnkiNote[];
  /** Note type name → fields with content that the newest version no longer has. */
  lost: Map<string, Set<string>>;
}

/** Fields by name: one the newest version adds goes empty, one it lacks is dropped. */
export function remapNotes(
  notes: AnkiNote[],
  own: AnkiNoteType[],
  newest: NewestNoteTypes,
): RemappedNotes {
  const ownById = new Map(own.map((t) => [t.id, t]));
  const lost = new Map<string, Set<string>>();
  const remapped = notes.map((note) => {
    const from = ownById.get(note.noteTypeId);
    const to = newest.get(note.noteTypeId);
    if (!from || !to || sameFields(from.fields, to.fields)) return note;
    const byName = new Map(from.fields.map((name, i) => [name, note.fields[i] ?? '']));
    for (const [name, value] of byName) {
      if (value && !to.fields.includes(name)) {
        lost.set(to.name, (lost.get(to.name) ?? new Set()).add(name));
      }
    }
    return { ...note, fields: to.fields.map((name) => byName.get(name) ?? '') };
  });
  return { notes: remapped, lost };
}

function sameFields(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}
