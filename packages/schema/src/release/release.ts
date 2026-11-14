// Zod schemas of a content release: what the draft changes against what is published (as the content database's
// release functions give it), its review, and publishing and undoing.
import { z } from 'zod';

/**
 * Goes up when a package needs a Worker that reads something new: the review blocks a draft the deployed Worker does
 * not understand (migrate → deploy → upload → publish).
 */
export const CONTENT_SCHEMA_VERSION = 1;

export const ReleaseOp = z.enum(['added', 'removed', 'changed', 'moved']);
export type ReleaseOp = z.infer<typeof ReleaseOp>;

/** `answer` may change the answer (the default when in doubt); `no_answer` does not change what has to be known. */
export const ReleaseClass = z.enum(['answer', 'no_answer', 'format', 'content']);
export type ReleaseClass = z.infer<typeof ReleaseClass>;

export const ReleaseMarkId = z.enum(['phone', 'answers', 'announcement']);
export type ReleaseMarkId = z.infer<typeof ReleaseMarkId>;

export const ReleaseMark = z.object({
  mark: ReleaseMarkId,
  checkedBy: z.string(),
  checkedAt: z.string(),
});
export type ReleaseMark = z.infer<typeof ReleaseMark>;

const count = z.number().int().nonnegative();

const ReleaseDeckChange = z.object({
  id: z.string(),
  name: z.string(),
  nameBefore: z.string().nullable(),
  op: z.enum(['added', 'removed', 'changed']),
  cardsBefore: count,
  cardsAfter: count,
  presetBefore: z.string().nullable(),
  presetAfter: z.string().nullable(),
});
type ReleaseDeckChange = z.infer<typeof ReleaseDeckChange>;

export const ReleaseAssessment = z.object({
  id: z.string(),
  courseId: z.string().nullable(),
  courseName: z.string().nullable(),
  semester: z.number().int().nullable(),
  name: z.string().nullable(),
  suggestedDate: z.string().nullable(),
  suggestedDateBefore: z.string().nullable(),
  articles: z.object({ added: count, removed: count, content: count, format: count }),
  questions: z.object({
    added: count,
    removed: count,
    answer: count,
    noAnswer: count,
    format: count,
    moved: count,
    keyChanged: count,
    /** A question only moved to another topic counts in `moved`, not here. */
    total: count,
  }),
  quizzes: z.array(
    z.object({ id: z.string(), title: z.string(), op: z.enum(['added', 'removed', 'changed']) }),
  ),
  cards: z.object({
    added: count,
    removed: count,
    moved: count,
    answer: count,
    noAnswer: count,
    format: count,
    notes: count,
  }),
  decks: z.array(ReleaseDeckChange),
  impactDecks: z.array(z.object({ id: z.string(), name: z.string().nullable(), cards: count })),
});
export type ReleaseAssessment = z.infer<typeof ReleaseAssessment>;

export const ReleaseFinding = z.object({
  rule: z.string(),
  assessmentId: z.string().nullable(),
  key: z.string(),
  detail: z.record(z.string(), z.unknown()),
});
export type ReleaseFinding = z.infer<typeof ReleaseFinding>;

export const ReleaseSummary = z.object({
  /** Changes whenever the draft's content does: the marks by hand are tied to it. */
  fingerprint: z.string().regex(/^[0-9a-f]{32}$/),
  schemaVersion: z.number().int().nullable(),
  unpublished: z.array(z.object({ kind: z.string(), id: z.string() })),
  marks: z.array(ReleaseMark),
  catalog: z.array(
    z.object({
      kind: z.enum(['semester', 'course', 'assessment']),
      id: z.string(),
      op: z.enum(['added', 'removed', 'changed']),
      before: z.record(z.string(), z.unknown()).nullable(),
      after: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
  noteTypes: z.array(
    z.object({ id: z.string(), name: z.string(), op: z.enum(['added', 'removed', 'changed']) }),
  ),
  presets: z.array(z.object({ name: z.string(), op: z.enum(['added', 'removed', 'changed']) })),
  /** The decks above the assessments, which no assessment lists. */
  decks: z.array(ReleaseDeckChange),
  assessments: z.array(ReleaseAssessment),
  findings: z.array(ReleaseFinding),
});
export type ReleaseSummary = z.infer<typeof ReleaseSummary>;

export const ReleaseOverview = z.object({
  supportedSchemaVersion: z.number().int(),
  summary: ReleaseSummary,
  /** A draft whose only change is these indexes is not empty. */
  browseIndexes: z
    .array(z.object({ assessmentId: z.string(), op: z.enum(['added', 'removed', 'changed']) }))
    .default([]),
});
export type ReleaseOverview = z.infer<typeof ReleaseOverview>;

export const ReleaseItemKind = z.enum(['card', 'article', 'question']);
export type ReleaseItemKind = z.infer<typeof ReleaseItemKind>;

const Fields = z.record(z.string(), z.string());

export const ReleaseCardItem = z.object({
  guid: z.string(),
  op: ReleaseOp,
  classification: ReleaseClass.nullable(),
  changedFields: z.array(z.string()),
  code: z.string().nullable(),
  versionBefore: z.number().int().nullable(),
  versionAfter: z.number().int().nullable(),
  noteType: z
    .object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['normal', 'cloze']),
      occlusion: z.boolean(),
      fields: z.array(z.string()),
    })
    .nullable(),
  fieldsBefore: Fields.nullable(),
  fieldsAfter: Fields.nullable(),
  cards: z.array(
    z.object({
      ord: z.number().int().nonnegative(),
      op: ReleaseOp,
      deckBefore: z.string().nullable(),
      deckAfter: z.string().nullable(),
      deckNameBefore: z.string().nullable(),
      deckNameAfter: z.string().nullable(),
    }),
  ),
});
export type ReleaseCardItem = z.infer<typeof ReleaseCardItem>;

export const ReleaseArticleItem = z.object({
  id: z.string(),
  op: ReleaseOp,
  classification: ReleaseClass.nullable(),
  title: z.string(),
  titleBefore: z.string().nullable(),
  versionBefore: z.number().int().nullable(),
  practiceBefore: z.record(z.string(), z.unknown()).nullable(),
  practiceAfter: z.record(z.string(), z.unknown()).nullable(),
  sections: z.array(
    z.object({
      anchor: z.string(),
      title: z.string(),
      op: z.enum(['added', 'removed', 'changed']),
      before: z.string().nullable(),
      after: z.string().nullable(),
    }),
  ),
});
export type ReleaseArticleItem = z.infer<typeof ReleaseArticleItem>;

export const ReleaseQuestionItem = z.object({
  key: z.string(),
  quizId: z.string(),
  id: z.string(),
  op: ReleaseOp,
  classification: ReleaseClass.nullable(),
  keyChanged: z.boolean(),
  moved: z.boolean(),
  sectionBefore: z.string().nullable(),
  sectionAfter: z.string().nullable(),
  groupBefore: z.string().nullable(),
  groupAfter: z.string().nullable(),
  figuresChanged: z.boolean(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});
export type ReleaseQuestionItem = z.infer<typeof ReleaseQuestionItem>;

const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), next: z.string().nullable() });
export const ReleaseCardPage = page(ReleaseCardItem);
export const ReleaseArticlePage = page(ReleaseArticleItem);
export const ReleaseQuestionPage = page(ReleaseQuestionItem);
export type ReleaseCardPage = z.infer<typeof ReleaseCardPage>;
export type ReleaseArticlePage = z.infer<typeof ReleaseArticlePage>;
export type ReleaseQuestionPage = z.infer<typeof ReleaseQuestionPage>;

export const ReleaseText = z.object({
  kind: z.enum(['article', 'quiz', 'question']),
  key: z.string(),
  assessmentId: z.string().nullable(),
  label: z.string(),
  text: z.string(),
});
export type ReleaseText = z.infer<typeof ReleaseText>;
export const ReleaseTextPage = page(ReleaseText);
export type ReleaseTextPage = z.infer<typeof ReleaseTextPage>;

export const ReleaseMediaPage = z.object({
  checked: z.array(z.string()),
  missing: z.array(z.string()),
  next: z.string().nullable(),
});
export type ReleaseMediaPage = z.infer<typeof ReleaseMediaPage>;

export const DeckImpact = z.object({
  deckId: z.string(),
  studentsSeen: count,
  cardsSeen: count,
  studentsActive: count,
});
export type DeckImpact = z.infer<typeof DeckImpact>;

export const ReleaseMarks = z.object({ marks: z.array(ReleaseMark) });
export type ReleaseMarks = z.infer<typeof ReleaseMarks>;

const ReleaseTableChanges = z.record(
  z.string(),
  z.object({ insert: count, update: count, delete: count }),
);
type ReleaseTableChanges = z.infer<typeof ReleaseTableChanges>;

export const ReleaseChecks = z.object({
  blocking: count,
  pending: count,
  ready: z.boolean(),
  warnings: z.array(z.object({ rule: z.string(), title: z.string(), count })).max(100),
  marks: z.array(z.object({ mark: ReleaseMarkId, checkedBy: z.string().nullable() })).max(10),
});
export type ReleaseChecks = z.infer<typeof ReleaseChecks>;

export const PublishRequest = z.object({
  fingerprint: z.string().regex(/^[0-9a-f]{32}$/),
  title: z.string().trim().min(1).max(300),
  checks: ReleaseChecks,
});
export type PublishRequest = z.infer<typeof PublishRequest>;

export const PublishResult = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  publishedAt: z.string(),
  changes: ReleaseTableChanges,
});
export type PublishResult = z.infer<typeof PublishResult>;

export const RevertRequest = z.object({ id: z.number().int().positive() });
export type RevertRequest = z.infer<typeof RevertRequest>;

export const RevertResult = z.object({
  id: z.number().int().positive(),
  revertedAt: z.string(),
  changes: ReleaseTableChanges,
});
export type RevertResult = z.infer<typeof RevertResult>;

export const ReleaseRecord = z.object({
  id: z.number().int().positive(),
  status: z.enum(['published', 'reverted']),
  title: z.string(),
  schemaVersion: z.number().int(),
  publishedAt: z.string(),
  publishedBy: z.string(),
  revertedAt: z.string().nullable(),
  revertedBy: z.string().nullable(),
  changes: ReleaseTableChanges,
  canRevert: z.boolean(),
});
export type ReleaseRecord = z.infer<typeof ReleaseRecord>;

export const ReleaseLog = z.object({ releases: z.array(ReleaseRecord) });
export type ReleaseLog = z.infer<typeof ReleaseLog>;
