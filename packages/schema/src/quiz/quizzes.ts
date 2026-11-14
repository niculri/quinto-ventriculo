// Zod schemas of the practice tests (test → sections or tabs → groups or topics → questions) and their API shapes.
import { z } from 'zod';
import { Slug } from '../content/content';

/** Unique on the site and stable: everybody's progress hangs from it. */
export const QuizId = Slug;

export const QuizSectionId = Slug;

export const QuizGroupId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'id de grupo inválido');

/** Unique in its test and stable when its text changes: the progress hangs from it. */
export const QuizQuestionId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/, 'id de pregunta inválido');

/** HTML already converted and safe; the web sanitizes it again before showing it. */
const Html = z.string();

export const QUIZ_THEME_TOKENS = ['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'] as const;
const ThemeColors = z.record(
  z.enum(QUIZ_THEME_TOKENS),
  z.string().regex(/^#[0-9A-Fa-f]{3,8}$/, 'color inválido'),
);
export const QuizTheme = z.object({ light: ThemeColors, dark: ThemeColors });
export type QuizTheme = z.infer<typeof QuizTheme>;

/** SVGs go inline with the page's colors (`var(--ink)`…), so they follow light and dark. */
export const QuizFigure = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('svg'),
    svg: z.string().startsWith('<svg'),
    displayWidth: z.number().positive().optional(),
    caption: z.string().optional(),
  }),
  z.object({
    kind: z.literal('image'),
    media: z.string(),
    src: z.string().optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alt: z.string(),
    displayWidth: z.number().positive().optional(),
    caption: z.string().optional(),
  }),
]);
export type QuizFigure = z.infer<typeof QuizFigure>;

export const QuizTableCell = z.object({
  html: Html,
  header: z.boolean(),
  highlight: z.boolean().optional(),
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
  context: Html.optional(),
  prompt: Html,
  figures: z.array(QuizFigure).default([]),
  figureBeside: z.boolean().default(false),
  table: QuizTable.optional(),
  explanation: Html.optional(),
  origin: Html.optional(),
});

export const ChoiceQuestion = QuestionBase.extend({
  kind: z.literal('choice'),
  options: z.array(Html).min(2).max(6),
  /** From 0, in the original order. */
  correct: z.number().int().nonnegative(),
  optionExplanations: z.array(Html).optional(),
  /** Its alternatives never shuffle (they name each other: «a y c»). */
  fixedOrder: z.boolean().default(false),
})
  .refine((q) => q.correct < q.options.length, 'la correcta no es una de las alternativas')
  .refine(
    (q) => !q.optionExplanations || q.optionExplanations.length === q.options.length,
    'una explicación por alternativa',
  );
export type ChoiceQuestion = z.infer<typeof ChoiceQuestion>;

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

export const QuizListingItem = z.union([Html, z.object({ title: Html, items: z.array(Html) })]);
export const QuizListing = z.object({ title: Html, items: z.array(QuizListingItem) });
export type QuizListing = z.infer<typeof QuizListing>;

export const QuizSectionSummary = z.object({
  id: QuizSectionId,
  name: Html,
  label: Html.optional(),
  description: Html,
  notice: Html.optional(),
  groupsTitle: z.string(),
  listing: QuizListing.optional(),
  questionCount: z.number().int().positive(),
  hasChoices: z.boolean(),
  groups: z.array(QuizGroupSummary).min(1),
});
export type QuizSectionSummary = z.infer<typeof QuizSectionSummary>;

export const QuizSummary = z.object({
  id: QuizId,
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

export const QuizDetail = QuizSummary.extend({
  /** Empty unless they say more than the breadcrumbs and the title. */
  kicker: Html,
  heading: Html,
  footer: Html,
  theme: QuizTheme,
  sections: z.array(QuizSectionSummary).min(1),
});
export type QuizDetail = z.infer<typeof QuizDetail>;

export const QuizSectionDetail = z.object({
  quizId: QuizId,
  sectionId: QuizSectionId,
  groups: z.array(QuizGroup).min(1),
});
export type QuizSectionDetail = z.infer<typeof QuizSectionDetail>;

export const QuizIndex = z.object({ quizzes: z.array(QuizSummary) });
export type QuizIndex = z.infer<typeof QuizIndex>;

export const ImportedQuiz = QuizDetail.extend({
  sections: z.array(QuizSectionSummary.extend({ groups: z.array(QuizGroup).min(1) })).min(1),
  hash: z.string(),
  media: z.array(z.string()),
});
export type ImportedQuiz = z.infer<typeof ImportedQuiz>;

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
