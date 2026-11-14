// Zod schemas of the catalog (semesters, courses, assessments) and of the notes published as articles.
import { z } from 'zod';

export const NoteCode = z
  .string()
  .regex(/^AP-[A-Z0-9]+(?:-[A-Z0-9]+)+$/, 'código de apunte inválido');

/** The article's code; the PDF's `NoteCode` stays as the note's id because the search and the links hang from it. */
export const WebCode = z.string().regex(/^QV-[A-Z0-9]+(?:-[A-Z0-9]+)+$/, 'código web inválido');

export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido');

export const Semester = z.object({
  number: z.number().int().min(1).max(14),
  name: z.string().min(1),
});
export type Semester = z.infer<typeof Semester>;

export const Course = z.object({
  id: Slug,
  semester: z.number().int().min(1).max(14),
  name: z.string().min(1),
  emoji: z.string().min(1),
  position: z.number().int(),
});
export type Course = z.infer<typeof Course>;

export const Assessment = z.object({
  id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'id de evaluación inválido'),
  courseId: Slug,
  name: z.string().min(1),
  position: z.number().int(),
  suggestedDate: z.iso.date('fecha inválida').nullable().optional(),
});
export type Assessment = z.infer<typeof Assessment>;

export const NoteKind = z.enum(['lecture', 'seminar', 'practical', 'summary']);
export type NoteKind = z.infer<typeof NoteKind>;

const Term = z.enum(['autumn', 'spring']);
type Term = z.infer<typeof Term>;

export const NoteHeader = z.object({
  number: z
    .string()
    .regex(/^\d{1,2}(?:\.\d)?$/, 'número inválido')
    .optional(),
  baseFor: z
    .string()
    .regex(/^\d{1,2}(?:\.\d)?$/, 'número inválido')
    .optional(),
  lecturer: z.string().min(1).optional(),
  institution: z.string().min(1).optional(),
  term: Term,
  year: z.number().int().min(2000).max(2100),
});
export type NoteHeader = z.infer<typeof NoteHeader>;

export const NotePractice = z.object({
  quizId: z.string().min(1).optional(),
  section: z.string().min(1).optional(),
  groups: z.array(z.string().min(1)).optional(),
  deck: z.string().min(1).optional(),
});
export type NotePractice = z.infer<typeof NotePractice>;

export const NoteGroup = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\n<>]+$/, 'nombre de grupo inválido');
export type NoteGroup = z.infer<typeof NoteGroup>;

export const TocEntry = z.object({
  anchor: z.string().min(1),
  title: z.string().min(1),
  level: z.union([z.literal(2), z.literal(3)]),
});
export type TocEntry = z.infer<typeof TocEntry>;

export const NoteSummary = z.object({
  id: NoteCode,
  slug: Slug,
  courseId: Slug,
  assessmentId: z.string(),
  kind: NoteKind,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  position: z.number().int(),
  updatedAt: z.iso.datetime({ offset: true }),
  code: WebCode.optional(),
  header: NoteHeader.optional(),
  /** Lists show these dates, not `updatedAt`, which also moves with changes the reader does not see. */
  version: z.number().int().min(1).optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
  versionAt: z.iso.datetime({ offset: true }).optional(),
  practice: NotePractice.optional(),
  /** Only for showing: not part of the note's identity or URL, and changing it does not raise the version. */
  group: NoteGroup.optional(),
});
export type NoteSummary = z.infer<typeof NoteSummary>;

export const Note = NoteSummary.extend({
  sources: z.array(z.string()),
  html: z.string(),
  toc: z.array(TocEntry),
  createdOn: z.iso.date().optional(),
  practice: NotePractice.optional(),
});
export type Note = z.infer<typeof Note>;
