// Reads the published .apkg files: cards rendered like Anki and sanitized, plus the note types, presets and the deck
// tree they need.
import { resolve } from 'node:path';
import { parentDeckName, readApkgFile } from '@qv/anki-format';
import { ROOT_DECK_NAME } from '@qv/schema';
import { ImportError } from '../ImportError';
import { containerDeckId, DEFAULT_PRESET, levelOf } from './names';
import { newestNoteTypes } from './noteTypes';
import { processPackage } from './package';
import type { AssessmentPlace, DecksOptions, DecksResult, DecksState } from './types';

/** Where each assessment of the manifests sits in the catalog, and the names its decks must start with. */
function placeOf(op: DecksOptions, assessmentId: string): AssessmentPlace {
  const assessment = op.assessments.get(assessmentId)!;
  const course = op.courses.find((c) => c.id === assessment.courseId);
  const semester = course ? op.semesters.find((s) => s.number === course.semester) : undefined;
  if (!course || !semester) {
    throw new ImportError(
      'manifest',
      `La evaluación ${assessment.id} no tiene su ramo o su semestre en el catálogo.`,
    );
  }
  return {
    semesterNumber: semester.number,
    courseId: course.id,
    assessmentId: assessment.id,
    expected: [
      ROOT_DECK_NAME,
      semester.name,
      `${course.emoji} ${course.ankiName ?? course.name}`,
      assessment.name,
    ],
  };
}

/** Anki exports no parent decks: they are created here with an id from the full name, stable between imports. */
function addParentDecks(state: DecksState): void {
  for (const d of [...state.decks.values()]) {
    for (let name = parentDeckName(d.name); name !== null; name = parentDeckName(name)) {
      if (state.decks.has(name)) continue;
      const id = containerDeckId(name);
      if (state.deckIds.has(id)) {
        throw new ImportError('material', `El id ${id} del mazo «${name}» está repetido.`);
      }
      state.deckIds.add(id);
      state.decks.set(name, {
        id,
        name,
        description: '',
        parentId: null,
        ...levelOf(name, d.semester, d.courseId, d.assessmentId),
        preset: DEFAULT_PRESET,
        position: 0,
      });
    }
  }
}

function finish(state: DecksState): void {
  addParentDecks(state);
  const { decks, presets, result } = state;
  if (
    [...decks.values()].some((d) => d.preset === DEFAULT_PRESET) &&
    !presets.has(DEFAULT_PRESET)
  ) {
    presets.set(DEFAULT_PRESET, { name: DEFAULT_PRESET, config: {} });
  }
  result.decks = [...decks.values()]
    .map((d) => {
      const parent = parentDeckName(d.name);
      return { ...d, parentId: parent === null ? null : decks.get(parent)!.id };
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  result.noteTypes = [...state.noteTypes.values()];
  result.presets = [...presets.values()];
}

export async function buildDecks(op: DecksOptions): Promise<DecksResult> {
  const read = op.read ?? readApkgFile;
  const state: DecksState = {
    noteTypes: new Map(),
    presets: new Map(),
    decks: new Map(),
    deckIds: new Set(),
    guids: new Set(),
    result: { noteTypes: [], presets: [], decks: [], notes: [], media: new Map(), warnings: [] },
  };
  const tied = new Set<string>();
  const newest = await newestNoteTypes(
    op.manifests.flatMap((m) => m.decks.map((entry) => resolve(op.root, entry.apkg))),
    read,
    (name) => tied.add(name),
  );
  for (const name of tied) {
    state.result.warnings.push(
      `el tipo de nota «${name}» viene en dos versiones con la misma fecha y distinto contenido; se elige una de forma fija. Vuelve a armar un mazo con la plantilla actual.`,
    );
  }
  for (const manifest of op.manifests) {
    const place = placeOf(op, manifest.assessmentId);
    for (const entry of manifest.decks) await processPackage(op, state, place, entry, newest);
  }
  finish(state);
  return state.result;
}
