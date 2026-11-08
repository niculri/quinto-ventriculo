import { z } from 'zod';
import { Slug } from './content';

/**
 * Practice tests (quizzes): a test → its sections (tabs) → their groups (topics) → their questions, as the
 * `pauta-a-test` skill makes them. The author's, common to everybody (content database); each user's rounds
 * and answers go in the users database. Every text that is shown is HTML already converted and safe (bold,
 * italics, superscripts, subscripts and line breaks); the web sanitizes it again before showing it.
 */

/**
 * Id of a test: unique on the site and stable, it is the key of everybody's progress and of the API
 * («biologia-celular-certamen-2-preguntas-de-practica»). The manifest fixes it.
 */
export const QuizId = Slug;

/** Id of a section (tab) of a test, also its URL segment: «pautas», «nuevas». */
export const QuizSectionId = Slug;

/** Id of a group (topic) inside a section: «01», «07». */
export const QuizGroupId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'id de grupo inválido');

/**
 * Id of a question, unique in its test and stable: if its text, alternatives or explanation change, the
 * progress hanging from it stays. It is the one the source gives («D-p02-04», «N03-12»).
 */
export const QuizQuestionId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/, 'id de pregunta inválido');

/** HTML of a text of the test, already converted and safe. */
const Html = z.string();

/** Colors of the test that change from course to course (the skill's «tema»), light and dark. */
export const QUIZ_THEME_TOKENS = ['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'] as const;
const ThemeColors = z.record(
  z.enum(QUIZ_THEME_TOKENS),
  z.string().regex(/^#[0-9A-Fa-f]{3,8}$/, 'color inválido'),
);
export const QuizTheme = z.object({ light: ThemeColors, dark: ThemeColors });
export type QuizTheme = z.infer<typeof QuizTheme>;

/**
 * A figure. The SVGs (recreated figures, diagrams and the skill's charts, drawn when importing) go inline
 * and sanitized: they use the colors of the page (`var(--ink)`, `var(--g1)`…), so they follow light and dark.
 * The photos go to the image store; the API gives each one a signed `src`.
 */
export const QuizFigure = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('svg'),
    svg: z.string().startsWith('<svg'),
    /**
     * The skill's «ancho»: with `figureBeside`, the width of the figure's column (at most 58 %; 42 % without
     * it). An SVG keeps its own width.
     */
    displayWidth: z.number().positive().optional(),
    /** Short line under the figure («Imagen recreada a partir de la original (certamen 2021).»), plain text. */
    caption: z.string().optional(),
  }),
  z.object({
    kind: z.literal('image'),
    /** Key in the store (`tests/<hash>.webp`). */
    media: z.string(),
    /** Signed URL: the API adds it. */
    src: z.string().optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alt: z.string(),
    /** Width to show it at (px), the skill's «ancho». */
    displayWidth: z.number().positive().optional(),
    caption: z.string().optional(),
  }),
]);
export type QuizFigure = z.infer<typeof QuizFigure>;

export const QuizTableCell = z.object({
  html: Html,
  header: z.boolean(),
  highlight: z.boolean().optional(),
  /** A corner without borders. */
  empty: z.boolean().optional(),
  colSpan: z.number().int().min(2).optional(),
  rowSpan: z.number().int().min(2).optional(),
});
export type QuizTableCell = z.infer<typeof QuizTableCell>;

export const QuizTable = z.object({
  title: Html.optional(),
  rows: z.array(z.array(QuizTableCell)).min(1),
});
export type QuizTable = z.infer<typeof QuizTable>;

const QuestionBase = z.object({
  id: QuizQuestionId,
  /** Statement or case before the question (the skill's «e»). */
  context: Html.optional(),
  /** The question («q»). */
  prompt: Html,
  /** «fig»: side by side. */
  figures: z.array(QuizFigure).default([]),
  /** «fig_izq»: the figure to the left of the alternatives (above them on a phone). */
  figureBeside: z.boolean().default(false),
  table: QuizTable.optional(),
  /** «exp»: the explanation («Idea clave» when there are explanations by alternative). */
  explanation: Html.optional(),
  // The skill's «cambio» (what a revision corrected in the question) is not published: the owner does not
  // want it on the site (2026-11-01).
  /** «origen»: where it comes from («Certamen 2021»), next to its number. */
  origin: Html.optional(),
});

/** A question with alternatives (2 to 6), one correct. */
export const ChoiceQuestion = QuestionBase.extend({
  kind: z.literal('choice'),
  options: z.array(Html).min(2).max(6),
  /** Index of the correct one, from 0, in the original order. */
  correct: z.number().int().nonnegative(),
  /** «expo»: an explanation for each alternative, in the order of `options`. */
  optionExplanations: z.array(Html).optional(),
  /** «fijas»: its alternatives never shuffle (they name each other: «a y c»). */
  fixedOrder: z.boolean().default(false),
})
  .refine((q) => q.correct < q.options.length, 'la correcta no es una de las alternativas')
  .refine(
    (q) => !q.optionExplanations || q.optionExplanations.length === q.options.length,
    'una explicación por alternativa',
  );
export type ChoiceQuestion = z.infer<typeof ChoiceQuestion>;

/** A question without alternatives: the answer is shown and the user says whether they knew it. */
export const ShortQuestion = QuestionBase.extend({
  kind: z.literal('short'),
  answer: Html,
});
export type ShortQuestion = z.infer<typeof ShortQuestion>;

export const QuizQuestion = z.discriminatedUnion('kind', [ChoiceQuestion, ShortQuestion]);
export type QuizQuestion = z.infer<typeof QuizQuestion>;

export const QuizGroup = z.object({
  id: QuizGroupId,
  name: Html,
  topic: Html.optional(),
  questions: z.array(QuizQuestion).min(1),
});
export type QuizGroup = z.infer<typeof QuizGroup>;

export const QuizGroupSummary = z.object({
  id: QuizGroupId,
  name: Html,
  topic: Html.optional(),
  questionCount: z.number().int().positive(),
});
export type QuizGroupSummary = z.infer<typeof QuizGroupSummary>;

/** A list item under the notice: a text or a sublist with its title (a collapsible of its own). */
export const QuizListingItem = z.union([Html, z.object({ title: Html, items: z.array(Html) })]);
export const QuizListing = z.object({ title: Html, items: z.array(QuizListingItem) });
export type QuizListing = z.infer<typeof QuizListing>;

/** A section (tab), with what the cover shows. Its texts already resolved (the section's or the test's). */
export const QuizSectionSummary = z.object({
  id: QuizSectionId,
  /** The tab's name (HTML); empty in a test without tabs. */
  name: Html,
  /** «etiqueta»: over every question of the section («Pauta original»). */
  label: Html.optional(),
  description: Html,
  notice: Html.optional(),
  /** Legend of the groups' choice («Qué temas practicar»), plain text. */
  groupsTitle: z.string(),
  listing: QuizListing.optional(),
  questionCount: z.number().int().positive(),
  /** Whether it has questions with alternatives (only then «Mezclar también las alternativas»). */
  hasChoices: z.boolean(),
  groups: z.array(QuizGroupSummary).min(1),
});
export type QuizSectionSummary = z.infer<typeof QuizSectionSummary>;

/** A test in the catalog (its assessment's «Tests»). */
export const QuizSummary = z.object({
  id: QuizId,
  /** Its URL segment, unique in its assessment (every one can have its «preguntas-de-practica»). */
  slug: Slug,
  courseId: Slug,
  assessmentId: z.string(),
  title: z.string().min(1),
  position: z.number().int(),
  questionCount: z.number().int().nonnegative(),
  sectionCount: z.number().int().positive(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type QuizSummary = z.infer<typeof QuizSummary>;

/** `GET /api/quizzes/:id`: the test and its sections, without the questions. */
export const QuizDetail = QuizSummary.extend({
  /**
   * The skill's page's «kicker», «encabezado» and «pie», when they say something the site does not (empty
   * if not: the breadcrumbs and the title already say the course and the assessment). Without a heading the
   * cover shows the title.
   */
  kicker: Html,
  heading: Html,
  footer: Html,
  theme: QuizTheme,
  sections: z.array(QuizSectionSummary).min(1),
});
export type QuizDetail = z.infer<typeof QuizDetail>;

/** `GET /api/quizzes/:id/sections/:sectionId`: the questions of a section, by group. */
export const QuizSectionDetail = z.object({
  quizId: QuizId,
  sectionId: QuizSectionId,
  groups: z.array(QuizGroup).min(1),
});
export type QuizSectionDetail = z.infer<typeof QuizSectionDetail>;

/** `GET /api/quizzes?course=&assessment=`: the tests of a course or an assessment. */
export const QuizIndex = z.object({ quizzes: z.array(QuizSummary) });
export type QuizIndex = z.infer<typeof QuizIndex>;

/** What the importer produces and the content database stores: the test with every question. */
export const ImportedQuiz = QuizDetail.extend({
  sections: z.array(QuizSectionSummary.extend({ groups: z.array(QuizGroup).min(1) })).min(1),
  /** sha256 of the imported test: unchanged → not rewritten. */
  hash: z.string(),
  /** Keys of its images in the store (R2). */
  media: z.array(z.string()),
});
export type ImportedQuiz = z.infer<typeof ImportedQuiz>;

/** The section (tab) summaries of an imported test, as the API gives them (the groups without questions). */
export function quizDetail(q: ImportedQuiz): QuizDetail {
  const { hash: _h, media: _m, sections, ...rest } = q;
  return {
    ...rest,
    sections: sections.map((s) => ({
      ...s,
      groups: s.groups.map(({ questions, ...g }) => ({ ...g, questionCount: questions.length })),
    })),
  };
}

export function quizSummary(q: QuizDetail | ImportedQuiz): QuizSummary {
  return {
    id: q.id,
    slug: q.slug,
    courseId: q.courseId,
    assessmentId: q.assessmentId,
    title: q.title,
    position: q.position,
    questionCount: q.questionCount,
    sectionCount: q.sectionCount,
    updatedAt: q.updatedAt,
  };
}
