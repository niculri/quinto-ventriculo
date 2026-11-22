// Checks the references inside the content folder: the catalog's links, the notes, decks and tests that name each other.
import { ImportError } from '../errors';
import { defaultQuizId } from '../quizzes/ids';
import type { Manifest, NotesManifest } from './schemas';

type Catalog = Manifest['catalog'];

function catalogErrors(catalog: Catalog): string[] {
  const errors: string[] = [];
  const semesters = new Set(catalog.semesters.map((s) => s.number));
  const courses = new Set(catalog.courses.map((c) => c.id));
  for (const c of catalog.courses) {
    if (!semesters.has(c.semester))
      errors.push(`El ramo ${c.id} usa el semestre ${c.semester}, que no existe.`);
  }
  for (const a of catalog.assessments) {
    if (!courses.has(a.courseId))
      errors.push(`La evaluación ${a.id} usa el ramo ${a.courseId}, que no existe.`);
    if (!a.id.startsWith(`${a.courseId}/`))
      errors.push(`La evaluación ${a.id} debe empezar con «${a.courseId}/».`);
  }
  return errors;
}

type NoteEntry = NotesManifest['notes'][number];

/** What one note repeats of the ones before it, and the test its «Ponte a prueba» names. */
function noteErrors(
  n: NoteEntry,
  assessmentId: string,
  seen: { ids: Set<string>; slugs: Set<string>; codes: Set<string> },
  quizAssessment: (quizId: string) => string | undefined,
): string[] {
  const errors: string[] = [];
  if (seen.ids.has(n.id)) errors.push(`El apunte ${n.id} está repetido.`);
  if (seen.slugs.has(n.slug)) errors.push(`El slug ${n.slug} está repetido.`);
  if (n.code && seen.codes.has(n.code)) errors.push(`El código ${n.code} está repetido.`);
  const quiz = n.practice?.quizId;
  if (quiz && quizAssessment(quiz) !== assessmentId) {
    errors.push(`El apunte ${n.id} enlaza al test ${quiz}, que no está en ${assessmentId}.`);
  }
  if ((n.practice?.section || n.practice?.groups?.length) && !quiz) {
    errors.push(`El apunte ${n.id} nombra una sección o temas de test sin decir qué test.`);
  }
  return errors;
}

function notesErrors(
  notes: Manifest['notes'],
  tests: NonNullable<Manifest['tests']>,
  assessments: ReadonlyMap<string, unknown>,
): string[] {
  const errors: string[] = [];
  const seen = { ids: new Set<string>(), slugs: new Set<string>(), codes: new Set<string>() };
  const quizzesById = new Map(
    tests.flatMap((m) => m.tests.map((t) => [t.id ?? defaultQuizId(m.assessmentId, t.slug), m])),
  );
  for (const m of notes) {
    if (!assessments.has(m.assessmentId)) errors.push(`No existe la evaluación ${m.assessmentId}.`);
    errors.push(...splitGroups(m));
    for (const n of m.notes) {
      errors.push(
        ...noteErrors(n, m.assessmentId, seen, (quizId) => quizzesById.get(quizId)?.assessmentId),
      );
      seen.ids.add(n.id);
      seen.slugs.add(n.slug);
      if (n.code) seen.codes.add(n.code);
    }
  }
  return errors;
}

function decksErrors(
  decks: Manifest['decks'],
  assessments: ReadonlyMap<string, unknown>,
): string[] {
  const errors: string[] = [];
  const packages = new Set<string>();
  for (const m of decks) {
    if (!assessments.has(m.assessmentId)) errors.push(`No existe la evaluación ${m.assessmentId}.`);
    for (const d of m.decks) {
      if (packages.has(d.apkg)) errors.push(`El mazo ${d.apkg} está repetido.`);
      packages.add(d.apkg);
    }
  }
  return errors;
}

function testsErrors(
  tests: NonNullable<Manifest['tests']>,
  assessments: ReadonlyMap<string, unknown>,
): string[] {
  const errors: string[] = [];
  const quizIds = new Set<string>();
  const quizSlugs = new Set<string>();
  const quizFolders = new Set<string>();
  for (const m of tests) {
    if (!assessments.has(m.assessmentId)) errors.push(`No existe la evaluación ${m.assessmentId}.`);
    for (const t of m.tests) {
      const id = t.id ?? defaultQuizId(m.assessmentId, t.slug);
      if (quizIds.has(id)) errors.push(`El id de test ${id} está repetido.`);
      if (quizSlugs.has(`${m.assessmentId}/${t.slug}`))
        errors.push(`El slug de test ${t.slug} está repetido en ${m.assessmentId}.`);
      if (quizFolders.has(t.folder)) errors.push(`El test ${t.folder} está repetido.`);
      quizIds.add(id);
      quizSlugs.add(`${m.assessmentId}/${t.slug}`);
      quizFolders.add(t.folder);
    }
  }
  return errors;
}

export function validateReferences({ catalog, notes, decks, tests = [] }: Manifest): void {
  const assessments = new Map(catalog.assessments.map((a) => [a.id, a]));
  const errors = [
    ...catalogErrors(catalog),
    ...notesErrors(notes, tests, assessments),
    ...decksErrors(decks, assessments),
    ...testsErrors(tests, assessments),
  ];
  if (errors.length) {
    throw new ImportError('manifest', `Manifiesto con errores:\n- ${errors.join('\n- ')}`);
  }
}

/** A group shows as one block in its assessment's list, so its notes must go one after the other by `position`. */
function splitGroups(m: NotesManifest): string[] {
  const ordered = [...m.notes].sort((a, b) => a.position - b.position);
  const closed = new Set<string>();
  const errors: string[] = [];
  let current: string | undefined;
  for (const n of ordered) {
    if (n.group !== current) {
      if (current !== undefined) closed.add(current);
      if (n.group !== undefined && closed.has(n.group)) {
        errors.push(
          `${m.assessmentId}: el grupo «${n.group}» queda partido (${n.id} va después de otro grupo): sus apuntes van seguidos por posición.`,
        );
      }
      current = n.group;
    }
  }
  return errors;
}
