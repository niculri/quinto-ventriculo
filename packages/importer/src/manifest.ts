import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  Assessment,
  Course,
  DeckId,
  NoteCode,
  NoteGroup,
  NoteHeader,
  NoteKind,
  NotePractice,
  Semester,
  Slug,
  WebCode,
} from '@qv/schema';
import { defaultQuizId } from './quizzes';
import { readTaxonomies } from './taxonomy';
import type { AssessmentTaxonomy, TaxonomyHistory } from './taxonomy';

/**
 * A course of the catalog. `ankiName`: how its deck is called in Anki, when it is not the site's name
 * («🧬 Biología celular» for «Biología celular y molecular»); only the importer uses it, to check the decks.
 */
export const CatalogCourse = Course.extend({ ankiName: z.string().min(1).optional() });
export type CatalogCourse = z.infer<typeof CatalogCourse>;

/** `content/catalog.json`: semesters, courses and assessments. */
export const CatalogManifest = z.object({
  semesters: z.array(Semester),
  courses: z.array(CatalogCourse),
  assessments: z.array(Assessment),
});
export type CatalogManifest = z.infer<typeof CatalogManifest>;

export const NoteEntry = z.object({
  /** The note's identity (the PDF's code, AP-…): search results and links hang from it. Never changes. */
  id: NoteCode,
  /** The web version's code (QV-…), shown with its version: «QV-BC-C2-08.2». */
  code: WebCode.optional(),
  slug: Slug,
  kind: NoteKind,
  position: z.number().int(),
  title: z.string().min(1),
  /** A topic line under the title, if the lecture has one («Recepción y transducción de señales»). */
  subtitle: z.string().optional(),
  /** Number, lecturer, institution, half of the year and year: the line under the title. */
  header: NoteHeader.optional(),
  /** Where the sources came from, written for students of any year (one item per line). */
  sources: z.array(z.string()).default([]),
  /** «Ponte a prueba»: the test (and its topics) and the deck of this lecture. */
  practice: NotePractice.optional(),
  /**
   * The group it is listed in (a week in Anatomía: «S5 - SMAS y cavidad nasal»). Only for showing: the id, the slug
   * and the version do not depend on it. The notes of a group go one after the other by `position`.
   */
  group: NoteGroup.optional(),
  /** The Markdown (articulo.md or apunte.md), relative to the root folder of the material. */
  sourceFile: z.string().min(1),
});
export type NoteEntry = z.infer<typeof NoteEntry>;

/** `content/notes/<assessment>.json`: the published notes of an assessment. */
export const NotesManifest = z.object({
  assessmentId: z.string(),
  notes: z.array(NoteEntry),
});
export type NotesManifest = z.infer<typeof NotesManifest>;

/** `content/decks/<assessment>.json`: the published Anki decks of an assessment. */
export const DecksManifest = z.object({
  assessmentId: z.string(),
  decks: z.array(
    z.object({
      /** .apkg, relative to the root folder of the material. */
      apkg: z.string().min(1).endsWith('.apkg'),
      /**
       * Leaves out the notes that name IMAIOS (an image, the source, a tag): they are for the owner's personal use
       * and never go up to the site. Without it, a package with such notes stops the import.
       */
      excludeImaios: z.boolean().optional(),
    }),
  ),
});
export type DecksManifest = z.infer<typeof DecksManifest>;

/**
 * `content/tests/<assessment>.json`: the published practice tests of an assessment, each one a folder made
 * with the `pauta-a-test` skill (test.json + its questions and figures).
 */
export const QuizzesManifest = z.object({
  assessmentId: z.string(),
  tests: z.array(
    z.object({
      /**
       * Id of the test, unique on the site (everybody's progress hangs from it). Default: the assessment and
       * the slug; fix it before renaming the slug.
       */
      id: Slug.optional(),
      /** Its URL: …/courses/<course>/tests/<assessment>/<slug>. Unique in its assessment. */
      slug: Slug,
      position: z.number().int(),
      /** The test's folder, relative to the root folder of the material. */
      folder: z.string().min(1),
      /** Its name on the site (test.json's «titulo» is the standalone page's). */
      title: z.string().min(1).optional(),
      /** null: leave out test.json's «kicker», «encabezado» or «pie»; a text: replace it. */
      kicker: z.string().nullable().optional(),
      heading: z.string().nullable().optional(),
      footer: z.string().nullable().optional(),
      /**
       * By section id: its description and notice on the site instead of test.json's («{n}» is the number of
       * questions; a notice null: none).
       */
      sections: z
        .record(
          z.string(),
          z.object({
            description: z.string().min(1).optional(),
            notice: z.string().min(1).nullable().optional(),
          }),
        )
        .optional(),
      /**
       * By question id: its general explanation on the site instead of test.json's «exp» (for a text that
       * speaks of how the source came, and not of the subject).
       */
      questions: z.record(z.string(), z.object({ explanation: z.string().min(1) })).optional(),
      /**
       * Accept questions without a stable id (no `id`, no source tag): their id is their place in the group.
       * Only for a test that will grow only at the end of each group (see convertQuiz).
       */
      allowPositionalIds: z.boolean().optional(),
    }),
  ),
});
export type QuizzesManifest = z.infer<typeof QuizzesManifest>;

/** What can be taken off the site in minutes (step 1.5): an article, a deck with its subdecks, a test or an image. */
export const UnpublishedKind = z.enum(['note', 'deck', 'quiz', 'image']);
export type UnpublishedKind = z.infer<typeof UnpublishedKind>;

/** An image's key in R2: `notes/<hash>.webp`, `cards/…` or `tests/…` (its name is its hash). */
export const MediaKey = z
  .string()
  .regex(/^(?:notes|cards|tests)\/[0-9a-f]{16,64}\.webp$/, 'clave de imagen inválida');

/** The id each kind is known by in the list: the note's (AP-…), the test's, the deck's (Anki's) and the image's key. */
const UNPUBLISHED_ID: Record<UnpublishedKind, z.ZodType<string>> = {
  note: NoteCode,
  deck: DeckId,
  quiz: Slug,
  image: MediaKey,
};

export const UnpublishedItem = z
  .object({
    kind: UnpublishedKind,
    id: z.string().min(1),
    /** Why it went (a serious error, a lecturer asked): for whoever reads the list later. */
    reason: z.string().trim().min(1).max(500),
    /** When it went (YYYY-MM-DD). */
    date: z.iso.date(),
    /** Who took it off. */
    by: z.string().min(1).max(200).optional(),
  })
  .superRefine((item, ctx) => {
    const ok = UNPUBLISHED_ID[item.kind].safeParse(item.id);
    if (!ok.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `id de ${item.kind} inválido: ${item.id}`,
      });
    }
  });
export type UnpublishedItem = z.infer<typeof UnpublishedItem>;

/**
 * `content/unpublished.json`: what is off the site. The importer never publishes it again while it is here, even if it
 * is still in the manifest (to publish it again: take it out of the list and import).
 */
export const UnpublishedList = z.object({ items: z.array(UnpublishedItem) });
export type UnpublishedList = z.infer<typeof UnpublishedList>;

export interface Manifest {
  catalog: CatalogManifest;
  notes: NotesManifest[];
  decks: DecksManifest[];
  /** Optional in tests written before v1.4. */
  tests?: QuizzesManifest[];
  /** content/unpublished.json (step 1.5; empty if the file does not exist). */
  unpublished?: UnpublishedItem[];
  /** content/taxonomy/ and content/topic-map/ (step 1.6): the assessments that have a taxonomy. */
  taxonomies?: AssessmentTaxonomy[];
}

export interface ReadManifestOptions {
  /**
   * The committed versions of the taxonomy files, to check that no topic id is used again (by default, git's history
   * of the folder; null: no history, only the files of now are checked).
   */
  history?: TaxonomyHistory | null;
  /**
   * false: content/taxonomy/ and content/topic-map/ are not read (`taxonomies` is empty). For `npm run unpublish`,
   * which does not use them: a taxonomy being edited must not stop taking a piece off the site in minutes (1.5).
   */
  taxonomies?: boolean;
}

/** Reads `content/unpublished.json` (a file that does not exist = nothing off the site). */
export async function readUnpublished(file: string): Promise<UnpublishedItem[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const parsed = UnpublishedList.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`${file}: ${parsed.error.message}`);
  const seen = new Set<string>();
  for (const i of parsed.data.items) {
    const key = `${i.kind}\u001f${i.id}`;
    if (seen.has(key)) throw new Error(`${file}: ${i.kind} ${i.id} está repetido.`);
    seen.add(key);
  }
  return parsed.data.items;
}

export async function readManifest(
  folder: string,
  options: ReadManifestOptions = {},
): Promise<Manifest> {
  const catalog = CatalogManifest.parse(
    JSON.parse(await readFile(join(folder, 'catalog.json'), 'utf8')),
  );
  const notes = await readFolder(join(folder, 'notes'), NotesManifest);
  const decks = await readFolder(join(folder, 'decks'), DecksManifest);
  const tests = await readFolder(join(folder, 'tests'), QuizzesManifest);
  const unpublished = await readUnpublished(join(folder, 'unpublished.json'));
  const taxonomies =
    options.taxonomies === false
      ? []
      : await readTaxonomies(
          folder,
          options.history,
          new Set(catalog.assessments.map((a) => a.id)),
        );
  validateReferences({ catalog, notes, decks, tests });
  return { catalog, notes, decks, tests, unpublished, taxonomies };
}

/** Every `*.json` of a folder, validated (a folder that does not exist = none). */
async function readFolder<T>(folder: string, schema: z.ZodType<T>): Promise<T[]> {
  let files: string[];
  try {
    files = (await readdir(folder)).filter((f) => f.endsWith('.json')).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  return Promise.all(
    files.map(async (f) => {
      const parsed = schema.safeParse(JSON.parse(await readFile(join(folder, f), 'utf8')));
      if (!parsed.success) throw new Error(`${join(folder, f)}: ${parsed.error.message}`);
      return parsed.data;
    }),
  );
}

/** Checks that everything that is referenced exists and that no id or slug is repeated. */
export function validateReferences({ catalog, notes, decks, tests = [] }: Manifest): void {
  const errors: string[] = [];
  const semesters = new Set(catalog.semesters.map((s) => s.number));
  const courses = new Set(catalog.courses.map((c) => c.id));
  const assessments = new Map(catalog.assessments.map((a) => [a.id, a]));
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
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const codes = new Set<string>();
  const quizzesById = new Map(
    tests.flatMap((m) => m.tests.map((t) => [t.id ?? defaultQuizId(m.assessmentId, t.slug), m])),
  );
  for (const m of notes) {
    if (!assessments.has(m.assessmentId)) errors.push(`No existe la evaluación ${m.assessmentId}.`);
    errors.push(...splitGroups(m));
    for (const n of m.notes) {
      if (ids.has(n.id)) errors.push(`El apunte ${n.id} está repetido.`);
      if (slugs.has(n.slug)) errors.push(`El slug ${n.slug} está repetido.`);
      if (n.code && codes.has(n.code)) errors.push(`El código ${n.code} está repetido.`);
      const quiz = n.practice?.quizId;
      if (quiz && quizzesById.get(quiz)?.assessmentId !== m.assessmentId) {
        errors.push(`El apunte ${n.id} enlaza al test ${quiz}, que no está en ${m.assessmentId}.`);
      }
      if ((n.practice?.section || n.practice?.groups?.length) && !quiz) {
        errors.push(`El apunte ${n.id} nombra una sección o temas de test sin decir qué test.`);
      }
      ids.add(n.id);
      slugs.add(n.slug);
      if (n.code) codes.add(n.code);
    }
  }
  const packages = new Set<string>();
  for (const m of decks) {
    if (!assessments.has(m.assessmentId)) errors.push(`No existe la evaluación ${m.assessmentId}.`);
    for (const d of m.decks) {
      if (packages.has(d.apkg)) errors.push(`El mazo ${d.apkg} está repetido.`);
      packages.add(d.apkg);
    }
  }
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
  if (errors.length) throw new Error(`Manifiesto con errores:\n- ${errors.join('\n- ')}`);
}

/**
 * A group of notes (a week) shows as one block in its assessment's list: its notes have to go one after the other by
 * `position`, or the week would show twice. Notes without a group may go anywhere.
 */
export function splitGroups(m: NotesManifest): string[] {
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
