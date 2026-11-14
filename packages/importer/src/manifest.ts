// Schemas and readers of the content folder: the catalog, the note, deck and test manifests and the unpublished list.
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

/** `ankiName`: the course's deck name in Anki when it differs from the site's; only the deck check uses it. */
export const CatalogCourse = Course.extend({ ankiName: z.string().min(1).optional() });
export type CatalogCourse = z.infer<typeof CatalogCourse>;

const CatalogManifest = z.object({
  semesters: z.array(Semester),
  courses: z.array(CatalogCourse),
  assessments: z.array(Assessment),
});
type CatalogManifest = z.infer<typeof CatalogManifest>;

export const NoteEntry = z.object({
  /** Search results and links hang from it: it never changes. */
  id: NoteCode,
  code: WebCode.optional(),
  slug: Slug,
  kind: NoteKind,
  position: z.number().int(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  header: NoteHeader.optional(),
  sources: z.array(z.string()).default([]),
  practice: NotePractice.optional(),
  group: NoteGroup.optional(),
  sourceFile: z.string().min(1),
});
export type NoteEntry = z.infer<typeof NoteEntry>;

const NotesManifest = z.object({
  assessmentId: z.string(),
  notes: z.array(NoteEntry),
});
type NotesManifest = z.infer<typeof NotesManifest>;

export const DecksManifest = z.object({
  assessmentId: z.string(),
  decks: z.array(
    z.object({
      apkg: z.string().min(1).endsWith('.apkg'),
      /** Without it, a package with notes that name IMAIOS stops the import (IMAIOS never goes to the site). */
      excludeImaios: z.boolean().optional(),
    }),
  ),
});
export type DecksManifest = z.infer<typeof DecksManifest>;

const QuizzesManifest = z.object({
  assessmentId: z.string(),
  tests: z.array(
    z.object({
      /** Everybody's progress hangs from it; by default it comes from the slug, so fix it before renaming one. */
      id: Slug.optional(),
      slug: Slug,
      position: z.number().int(),
      folder: z.string().min(1),
      title: z.string().min(1).optional(),
      /** These three override test.json's: null leaves it out, a text replaces it. */
      kicker: z.string().nullable().optional(),
      heading: z.string().nullable().optional(),
      footer: z.string().nullable().optional(),
      sections: z
        .record(
          z.string(),
          z.object({
            description: z.string().min(1).optional(),
            notice: z.string().min(1).nullable().optional(),
          }),
        )
        .optional(),
      questions: z.record(z.string(), z.object({ explanation: z.string().min(1) })).optional(),
      /** A question's id becomes its place in the group: only for a test that grows only at the end of each group. */
      allowPositionalIds: z.boolean().optional(),
    }),
  ),
});
type QuizzesManifest = z.infer<typeof QuizzesManifest>;

export const UnpublishedKind = z.enum(['note', 'deck', 'quiz', 'image']);
export type UnpublishedKind = z.infer<typeof UnpublishedKind>;

const MediaKey = z
  .string()
  .regex(/^(?:notes|cards|tests)\/[0-9a-f]{16,64}\.webp$/, 'clave de imagen inválida');

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
    reason: z.string().trim().min(1).max(500),
    date: z.iso.date(),
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

/** What is listed here is never published again, even while it is still in a manifest. */
export const UnpublishedList = z.object({ items: z.array(UnpublishedItem) });
export type UnpublishedList = z.infer<typeof UnpublishedList>;

export interface Manifest {
  catalog: CatalogManifest;
  notes: NotesManifest[];
  decks: DecksManifest[];
  tests?: QuizzesManifest[];
  unpublished?: UnpublishedItem[];
  taxonomies?: AssessmentTaxonomy[];
}

export interface ReadManifestOptions {
  /** By default, git's history of the folder; null: only the files of now are checked. */
  history?: TaxonomyHistory | null;
  /** false for `npm run unpublish`: a taxonomy being edited must not stop taking a piece off the site. */
  taxonomies?: boolean;
}

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
