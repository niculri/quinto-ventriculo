// Zod schemas of the error reports as the code uses them: the target and its place, a report, its resolution and the
// administrators' queue.
import { z } from 'zod';
import { REPORT_CATEGORIES, REPORT_KINDS, RESOLUTION_STATUSES } from '../constants/reports';

export const ReportKindSchema = z.enum(REPORT_KINDS);
export const ReportCategorySchema = z.enum(REPORT_CATEGORIES);
export const ResolutionStatusSchema = z.enum(RESOLUTION_STATUSES);

export const ReportLocation = z.object({
  path: z.string().optional(),
  title: z.string().optional(),
  deckId: z.string().optional(),
  section: z.string().optional(),
  sectionTitle: z.string().optional(),
  quote: z
    .object({ exact: z.string(), prefix: z.string().optional(), suffix: z.string().optional() })
    .optional(),
  figure: z.string().optional(),
  quizId: z.string().optional(),
  sectionId: z.string().optional(),
  number: z.number().optional(),
});
export type ReportLocation = z.infer<typeof ReportLocation>;

export const ReportTarget = z.object({
  kind: ReportKindSchema,
  /** 'guid:ord' (card) · the article's id (note) · 'quiz/question' (quiz_question). */
  id: z.string(),
  code: z.string().nullable(),
  version: z.number().nullable(),
  location: ReportLocation,
});
export type ReportTarget = z.infer<typeof ReportTarget>;

export const NewReport = ReportTarget.extend({
  category: ReportCategorySchema,
  comment: z.string(),
});
export type NewReport = z.infer<typeof NewReport>;

export const Resolution = z.object({
  status: ResolutionStatusSchema,
  note: z.string().nullable(),
  fixedVersion: z.number().nullable(),
  resolvedAt: z.string(),
});
export type Resolution = z.infer<typeof Resolution>;

export const MyReport = z.object({
  id: z.string(),
  kind: ReportKindSchema,
  targetId: z.string(),
  code: z.string().nullable(),
  version: z.number().nullable(),
  category: ReportCategorySchema,
  comment: z.string(),
  location: ReportLocation,
  createdAt: z.string(),
  resolution: Resolution.nullable(),
});
export type MyReport = z.infer<typeof MyReport>;

export const Reporter = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  blocked: z.boolean(),
});
export type Reporter = z.infer<typeof Reporter>;

export const QueueReport = z.object({
  id: z.string(),
  category: ReportCategorySchema,
  comment: z.string(),
  location: ReportLocation,
  version: z.number().nullable(),
  createdAt: z.string(),
  /** Null: the account was deleted, or the report was closed more than 12 months ago. */
  reporter: Reporter.nullable(),
});
export type QueueReport = z.infer<typeof QueueReport>;

export const ReportGroup = z.object({
  kind: ReportKindSchema,
  targetId: z.string(),
  code: z.string().nullable(),
  version: z.number().nullable(),
  title: z.string().nullable(),
  path: z.string().nullable(),
  reporters: z.number(),
  firstAt: z.string(),
  lastAt: z.string(),
  resolution: Resolution.extend({ id: z.string() }).nullable(),
  reports: z.array(QueueReport),
});
export type ReportGroup = z.infer<typeof ReportGroup>;

const BlockedReporter = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  blockedAt: z.string(),
});

export const ReportQueue = z.object({
  open: z.array(ReportGroup),
  resolved: z.array(ReportGroup),
  blocked: z.array(BlockedReporter),
});
export type ReportQueue = z.infer<typeof ReportQueue>;

export const ResolveInput = z.object({
  kind: ReportKindSchema,
  targetId: z.string(),
  status: ResolutionStatusSchema,
  note: z.string().nullable(),
  fixedVersion: z.number().nullable(),
});
export type ResolveInput = z.infer<typeof ResolveInput>;
