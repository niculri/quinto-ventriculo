import { z } from 'zod';

/**
 * The version of the shape of what the importer writes in the content database (step 1.7). It goes up when a
 * package needs a Worker that reads something new; the review list stops a draft whose version the deployed Worker
 * does not understand (the safe order: migrate → deploy → upload to the draft → publish).
 */
export const CONTENT_SCHEMA_VERSION = 1;

/**
 * What the draft changes against what is published (step 1.7, part 2): the shapes that `release_summary()`,
 * `release_items()`, `release_texts()` and `release_media()` of the content database give (migration
 * 20261110000000_release_review.sql), as the API passes them to the panel /settings/admin/releases.
 */

export const ReleaseOp = z.enum(['added', 'removed', 'changed', 'moved']);
export type ReleaseOp = z.infer<typeof ReleaseOp>;

/**
 * How a card or a question changed (section 2 of docs/plan/areas/publicacion-y-anuncios.md): `answer` = can change
 * the answer (the default when in doubt), `no_answer` = does not change what has to be known, `format` = the same
 * text. An article is `content` or `format`.
 */
export const ReleaseClass = z.enum(['answer', 'no_answer', 'format', 'content']);
export type ReleaseClass = z.infer<typeof ReleaseClass>;

/** The three marks by hand of the review list; `announcement` waits for the announcements (step C1). */
export const ReleaseMarkId = z.enum(['phone', 'answers', 'announcement']);
export type ReleaseMarkId = z.infer<typeof ReleaseMarkId>;

export const ReleaseMark = z.object({
  mark: ReleaseMarkId,
  checkedBy: z.string(),
  checkedAt: z.string(),
});
export type ReleaseMark = z.infer<typeof ReleaseMark>;

const count = z.number().int().nonnegative();

export const ReleaseDeckChange = z.object({
  id: z.string(),
  name: z.string(),
  nameBefore: z.string().nullable(),
  op: z.enum(['added', 'removed', 'changed']),
  cardsBefore: count,
  cardsAfter: count,
  presetBefore: z.string().nullable(),
  presetAfter: z.string().nullable(),
});
export type ReleaseDeckChange = z.infer<typeof ReleaseDeckChange>;

export const ReleaseAssessment = z.object({
  id: z.string(),
  courseId: z.string().nullable(),
  courseName: z.string().nullable(),
  semester: z.number().int().nullable(),
  name: z.string().nullable(),
  /** The author's suggested date of the test, in the draft and as published (YYYY-MM-DD). */
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
    /** Questions in the list (a question only moved to another topic is in `moved` and not classified). */
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
    /** Anki notes with some card in the list. */
    notes: count,
  }),
  decks: z.array(ReleaseDeckChange),
  /**
   * The published decks where a card goes out, moves or changes its answer, with how many: the panel asks how many
   * students saw them.
   */
  impactDecks: z.array(z.object({ id: z.string(), name: z.string().nullable(), cards: count })),
});
export type ReleaseAssessment = z.infer<typeof ReleaseAssessment>;

/** Something the database saw for the review list (`rule` names it; the panel knows what each one means). */
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
  /** The `schemaVersion` the draft was imported with (null: imported before step 1.7 part 2). */
  schemaVersion: z.number().int().nullable(),
  /** `content/unpublished.json` as the draft's last import read it. */
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
  /**
   * The decks above the assessments (the root, a semester's, a course's) whose name, preset or place change: no
   * assessment lists them. Revisión de cero (1.7, parte 2).
   */
  decks: z.array(ReleaseDeckChange),
  assessments: z.array(ReleaseAssessment),
  findings: z.array(ReleaseFinding),
});
export type ReleaseSummary = z.infer<typeof ReleaseSummary>;

/** `GET /api/admin/release`: the summary and the content version the deployed Worker understands. */
export const ReleaseOverview = z.object({
  supportedSchemaVersion: z.number().int(),
  summary: ReleaseSummary,
});
export type ReleaseOverview = z.infer<typeof ReleaseOverview>;

export const ReleaseItemKind = z.enum(['card', 'article', 'question']);
export type ReleaseItemKind = z.infer<typeof ReleaseItemKind>;

const Fields = z.record(z.string(), z.string());

/** An Anki note with some card that changed, with its cards. */
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

/** An article that changed, with the sections whose text changed (plain text, as the search has it). */
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

/** A question that changed (its document without the drawings of its figures). */
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

/** What a reader will read of an article or a test that the draft adds or changes (for the CON-9 check). */
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

/** `GET /api/admin/release/media`: the new images of a page, and which of them the image store does not have. */
export const ReleaseMediaPage = z.object({
  checked: z.array(z.string()),
  missing: z.array(z.string()),
  next: z.string().nullable(),
});
export type ReleaseMediaPage = z.infer<typeof ReleaseMediaPage>;

/** Whom a release reaches, by deck (the users' database, `admin_deck_impact()`). */
export const DeckImpact = z.object({
  deckId: z.string(),
  studentsSeen: count,
  cardsSeen: count,
  studentsActive: count,
});
export type DeckImpact = z.infer<typeof DeckImpact>;

/** `PUT /api/admin/release/marks`: the marks of the draft after the change. */
export const ReleaseMarks = z.object({ marks: z.array(ReleaseMark) });
export type ReleaseMarks = z.infer<typeof ReleaseMarks>;

// ─────────────────────────────────── publishing and undoing (step 1.7, part 3) ───────────────────────────────────

/** What a publication (or undoing it) did to each table of public: rows inserted, updated and deleted. */
export const ReleaseTableChanges = z.record(
  z.string(),
  z.object({ insert: count, update: count, delete: count }),
);
export type ReleaseTableChanges = z.infer<typeof ReleaseTableChanges>;

/**
 * The review list as the panel built it when it published, kept with the publication (`releases.checks`): how many
 * rules stopped it (0), the warnings it had and the marks by hand.
 */
export const ReleaseChecks = z.object({
  blocking: count,
  pending: count,
  ready: z.boolean(),
  warnings: z.array(z.object({ rule: z.string(), title: z.string(), count })).max(100),
  marks: z.array(z.object({ mark: ReleaseMarkId, checkedBy: z.string().nullable() })).max(10),
});
export type ReleaseChecks = z.infer<typeof ReleaseChecks>;

/** `POST /api/admin/release/publish`: the draft the panel showed (its fingerprint), a title and the review list. */
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

/** `POST /api/admin/release/revert`: the publication the panel showed as the last one. */
export const RevertRequest = z.object({ id: z.number().int().positive() });
export type RevertRequest = z.infer<typeof RevertRequest>;

export const RevertResult = z.object({
  id: z.number().int().positive(),
  revertedAt: z.string(),
  changes: ReleaseTableChanges,
});
export type RevertResult = z.infer<typeof RevertResult>;

/** A publication of the log (`release_log()`): only the last one, while published, can be undone. */
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

/** `GET /api/admin/releases`: the publications, newest first. */
export const ReleaseLog = z.object({ releases: z.array(ReleaseRecord) });
export type ReleaseLog = z.infer<typeof ReleaseLog>;
