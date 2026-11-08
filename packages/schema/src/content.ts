import { z } from 'zod';

/** Note code, the same one the PDF shows under its title: «AP-BC-C2-11», «AP-BC-C2-SEM5». */
export const NoteCode = z
  .string()
  .regex(/^AP-[A-Z0-9]+(?:-[A-Z0-9]+)+$/, 'código de apunte inválido');

/**
 * Code of the web version of a note (an article): «QV-BC-C2-08», «QV-BC-C2-SEM5». It is not the PDF's
 * (AP-…), which stays as the note's id because the search and the links hang from it.
 */
export const WebCode = z.string().regex(/^QV-[A-Z0-9]+(?:-[A-Z0-9]+)+$/, 'código web inválido');

/** Readable identifier for URLs: lowercase letters, digits and hyphens. */
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

/** Exam (certamen), unit, module or assessment: the division of a course. */
export const Assessment = z.object({
  id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'id de evaluación inválido'),
  courseId: Slug,
  name: z.string().min(1),
  position: z.number().int(),
  /** The date the author suggests for it, «2026-11-05» (each student confirms it or puts their own). */
  suggestedDate: z.iso.date('fecha inválida').nullable().optional(),
});
export type Assessment = z.infer<typeof Assessment>;

export const NoteKind = z.enum(['lecture', 'seminar', 'practical', 'summary']);
export type NoteKind = z.infer<typeof NoteKind>;

/** Half of the academic year: «otoño» is the first semester, «primavera» the second. */
export const Term = z.enum(['autumn', 'spring']);
export type Term = z.infer<typeof Term>;

/**
 * Who gave the lecture or seminar, and when: the line under the article's title («Clase 8 · Dra. Ana
 * Prueba D. · Semestre de primavera 2026 · ICBM, Universidad de Chile»). Structured, so that it can be
 * correlated across years later.
 */
export const NoteHeader = z.object({
  /** «8», «16.1». None for a note that is not a numbered lecture or seminar. */
  number: z
    .string()
    .regex(/^\d{1,2}(?:\.\d)?$/, 'número inválido')
    .optional(),
  /** A note that is not a lecture but the basis for some: «8» → «Apunte base para la clase 8 en adelante». */
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

/**
 * «Ponte a prueba» at the end of an article: the practice test of its assessment, opened in the topics of
 * that lecture (`section` and `groups`, as the test's ids), and its Anki deck (the last part of the deck's
 * name, «11 - Traducción»), if one is published in the same assessment.
 */
export const NotePractice = z.object({
  quizId: z.string().min(1).optional(),
  section: z.string().min(1).optional(),
  groups: z.array(z.string().min(1)).optional(),
  deck: z.string().min(1).optional(),
});
export type NotePractice = z.infer<typeof NotePractice>;

/** The name of a group of notes: «S5 - SMAS y cavidad nasal». One line of plain text. */
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
  /** Short line under the title: lecture, lecturer, date. Plain text. */
  subtitle: z.string().optional(),
  position: z.number().int(),
  updatedAt: z.iso.datetime({ offset: true }),
  /** The web version's code (articles); a note from before them has none. */
  code: WebCode.optional(),
  header: NoteHeader.optional(),
  /**
   * The web version: it goes up by one each time the published article changes (title, header, sources or
   * text), and `versionAt` is when. `publishedAt` is its first publication («Creado el»). In the summary too,
   * so that the course's list shows the same dates as the article (not `updatedAt`, which also moves with
   * changes the reader does not see).
   */
  version: z.number().int().min(1).optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
  versionAt: z.iso.datetime({ offset: true }).optional(),
  /** Its deck and test topics («Ponte a prueba»): the course's list links them from each lecture. */
  practice: NotePractice.optional(),
  /**
   * The group the note goes in, in its assessment's list and in the menu: a week in Anatomía («S5 - SMAS y cavidad
   * nasal»). Only for showing: it is not part of the note's identity nor of its URL, and changing it does not raise the
   * version. A note without one is listed as before (by kind).
   */
  group: NoteGroup.optional(),
});
export type NoteSummary = z.infer<typeof NoteSummary>;

export const Note = NoteSummary.extend({
  /** Sources of the note (the lines under the PDF title), plain text. */
  sources: z.array(z.string()),
  /** HTML already converted and sanitized. The API resolves the images' `src`. */
  html: z.string(),
  toc: z.array(TocEntry),
  createdOn: z.iso.date().optional(),
  practice: NotePractice.optional(),
});
export type Note = z.infer<typeof Note>;
