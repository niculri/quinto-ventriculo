import { z } from 'zod';
import { Slug } from './content';
import { DeckId } from './flashcards';

/**
 * «Uso» in the administration panel (step 2.9): figures that add up students, never a row per student. The users'
 * database counts what it keeps (`admin_usage()`); the Worker adds the opens it counts in Workers Analytics Engine, which
 * keep neither who opened nor what was searched.
 */

/** Below this many students a figure is not shown exact. */
export const USAGE_MIN_STUDENTS = 5;

/** The value of a figure that is not shown exact: it counts (or comes from) 1 to 4 students, or 1 to 4 opens. */
export const FEW = '<5' as const;

export const UsageCount = z.union([z.number().int().nonnegative(), z.literal(FEW)]);
export type UsageCount = z.infer<typeof UsageCount>;

/** What happened in a day, a week or a period. */
export const UsageFigures = z.object({
  /** Answered a card or a question, or started a round. */
  activeStudents: UsageCount,
  /** Their account was created then. */
  newStudents: UsageCount,
  ankiAnswers: UsageCount,
  newCards: UsageCount,
  roundsStarted: UsageCount,
  roundsFinished: UsageCount,
});
export type UsageFigures = z.infer<typeof UsageFigures>;

/** The opens, by kind of content (and the searches). */
export const UsageOpenFigures = z.object({
  notes: UsageCount,
  decks: UsageCount,
  quizzes: UsageCount,
  searches: UsageCount,
});
export type UsageOpenFigures = z.infer<typeof UsageOpenFigures>;

/** What the Worker counts: a note, a deck (its page or its study), a test opened, or a search. */
export const USAGE_EVENT_KINDS = ['note', 'deck', 'quiz', 'search'] as const;
export type UsageEventKind = (typeof USAGE_EVENT_KINDS)[number];

/** The kind of page a search was made from (never what was searched). */
export const SEARCH_CONTEXTS = [
  'home',
  'course',
  'note',
  'deck',
  'quiz',
  'search',
  'other',
] as const;
export type SearchContext = (typeof SEARCH_CONTEXTS)[number];

/**
 * `POST /api/usage/open`: a note, a deck (its page, its study or its final review) or a test (its cover or a round) was
 * opened, or a search was completed (sent, or a result opened), from that kind of page. Never who, nor what was searched.
 */
export const UsageOpenRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), id: Slug.max(120) }).strict(),
  z.object({ kind: z.literal('deck'), id: DeckId }).strict(),
  z.object({ kind: z.literal('quiz'), id: Slug.max(120) }).strict(),
  z.object({ kind: z.literal('search'), from: z.enum(SEARCH_CONTEXTS) }).strict(),
]);
export type UsageOpenRequest = z.infer<typeof UsageOpenRequest>;
export const UsageOpenAck = z.object({ ok: z.literal(true) });

const Day = z.iso.date();

const PeriodTotals = <T extends z.ZodTypeAny>(f: T) => z.object({ today: f, last7: f, last30: f });

/** The figures of a course or an assessment in the last 30 days (5 students or more). */
const GroupFigures = z.object({
  students: z.number().int().min(USAGE_MIN_STUDENTS),
  ankiAnswers: UsageCount,
  newCards: UsageCount,
  roundsStarted: UsageCount,
  roundsFinished: UsageCount,
});

export const UsageOpens = z.object({
  totals: PeriodTotals(UsageOpenFigures),
  /** The last 30 days, oldest first. */
  days: z.array(UsageOpenFigures.extend({ day: Day })),
  /** The most opened in the last 30 days (5 opens or more). */
  top: z.array(
    z.object({
      kind: z.enum(['note', 'deck', 'quiz']),
      id: z.string(),
      opens: z.number().int().min(USAGE_MIN_STUDENTS),
    }),
  ),
  /** The searches of the last 30 days, by the kind of page they were made from. */
  searches: z.array(z.object({ context: z.enum(SEARCH_CONTEXTS), count: UsageCount })),
});
export type UsageOpens = z.infer<typeof UsageOpens>;

export const UsageReport = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  /** The site's day: Santiago, from 4:00 to 4:00 (as Anki's day). */
  today: Day,
  timeZone: z.string(),
  minStudents: z.number().int().positive(),
  totals: PeriodTotals(UsageFigures),
  /** The last 30 days and the last 12 weeks (from Monday), oldest first. */
  days: z.array(UsageFigures.extend({ day: Day })),
  weeks: z.array(UsageFigures.extend({ week: Day })),
  /** The last 30 days: the units of Anki (a lecture, a week) and the tests used by 5 students or more. */
  decks: z.array(
    z.object({
      deckId: z.string(),
      students: z.number().int().min(USAGE_MIN_STUDENTS),
      answers: z.number().int().nonnegative(),
      newCards: UsageCount,
    }),
  ),
  quizzes: z.array(
    z.object({
      quizId: z.string(),
      students: z.number().int().min(USAGE_MIN_STUDENTS),
      roundsStarted: UsageCount,
      roundsFinished: UsageCount,
    }),
  ),
  courses: z.array(GroupFigures.extend({ courseId: z.string() })),
  assessments: z.array(GroupFigures.extend({ assessmentId: z.string(), courseId: z.string() })),
  invited: z.object({ signedIn: UsageCount, never: UsageCount }),
  /**
   * `activated`, `notActivated` and `percent` are null when one of the two parts is 1 to 4 students: with `eligible`
   * exact, the other part would give it by subtraction.
   */
  activation: z.object({
    eligible: UsageCount,
    activated: UsageCount.nullable(),
    notActivated: UsageCount.nullable(),
    percent: z.number().int().min(0).max(100).nullable(),
  }),
  /**
   * The opens of Workers Analytics Engine: `null` when they are not configured (`opensStatus`) or could not be read.
   */
  opens: UsageOpens.nullable(),
  opensStatus: z.enum(['ok', 'not_configured', 'unavailable']),
});
export type UsageReport = z.infer<typeof UsageReport>;

// ── What the users' database answers (snake_case, as it is written there) ──

const AdminUsageFiguresRow = z.object({
  active_students: UsageCount,
  new_students: UsageCount,
  anki_answers: UsageCount,
  new_cards: UsageCount,
  rounds_started: UsageCount,
  rounds_finished: UsageCount,
});
const AdminUsageGroupRow = z.object({
  students: z.number().int(),
  anki_answers: UsageCount,
  new_cards: UsageCount,
  rounds_started: UsageCount,
  rounds_finished: UsageCount,
});
/** What `admin_usage()` of the users' database answers (the Worker turns it into a `UsageReport`). */
export const AdminUsageRow = z.object({
  generated_at: z.string(),
  today: z.iso.date(),
  time_zone: z.string(),
  min_students: z.number().int(),
  totals: z.object({
    today: AdminUsageFiguresRow,
    last_7: AdminUsageFiguresRow,
    last_30: AdminUsageFiguresRow,
  }),
  days: z.array(AdminUsageFiguresRow.extend({ day: z.iso.date() })),
  weeks: z.array(AdminUsageFiguresRow.extend({ week: z.iso.date() })),
  decks: z.array(
    z.object({
      deck_id: z.string(),
      students: z.number().int(),
      answers: z.number().int(),
      new_cards: UsageCount,
    }),
  ),
  quizzes: z.array(
    z.object({
      quiz_id: z.string(),
      students: z.number().int(),
      rounds_started: UsageCount,
      rounds_finished: UsageCount,
    }),
  ),
  courses: z.array(AdminUsageGroupRow.extend({ course_id: z.string() })),
  assessments: z.array(
    AdminUsageGroupRow.extend({ assessment_id: z.string(), course_id: z.string() }),
  ),
  invited: z.object({ signed_in: UsageCount, never: UsageCount }),
  activation: z.object({
    eligible: UsageCount,
    activated: UsageCount.nullable(),
    not_activated: UsageCount.nullable(),
    percent: z.number().int().nullable(),
  }),
});
export type AdminUsageRow = z.infer<typeof AdminUsageRow>;
export type AdminUsageFigures = z.infer<typeof AdminUsageFiguresRow>;
export type AdminUsageGroup = z.infer<typeof AdminUsageGroupRow>;
