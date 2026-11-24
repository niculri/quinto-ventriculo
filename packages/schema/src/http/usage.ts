// Zod schemas of the admin panel's usage figures: totals over students, never a row per student, from the users'
// database plus the opens the Worker counts in Workers Analytics Engine (without who or what was searched).
import { z } from 'zod';
import { Slug } from '../content/content';
import { DeckId } from '../anki/flashcards';

/** Below this many students a figure is not shown exact. */
export const USAGE_MIN_STUDENTS = 5;

/** A figure that counts, or comes from, 1 to 4 students or opens. */
export const FEW = '<5' as const;

export const UsageCount = z.union([z.number().int().nonnegative(), z.literal(FEW)]);
export type UsageCount = z.infer<typeof UsageCount>;

export const UsageFigures = z.object({
  activeStudents: UsageCount,
  newStudents: UsageCount,
  ankiAnswers: UsageCount,
  newCards: UsageCount,
  roundsStarted: UsageCount,
  roundsFinished: UsageCount,
});
export type UsageFigures = z.infer<typeof UsageFigures>;

export const UsageOpenFigures = z.object({
  notes: UsageCount,
  decks: UsageCount,
  quizzes: UsageCount,
  searches: UsageCount,
});
export type UsageOpenFigures = z.infer<typeof UsageOpenFigures>;

export const USAGE_EVENT_KINDS = ['note', 'deck', 'quiz', 'search'] as const;
export type UsageEventKind = (typeof USAGE_EVENT_KINDS)[number];

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

export const UsageOpenRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), id: Slug.max(120) }).strict(),
  z.object({ kind: z.literal('deck'), id: DeckId }).strict(),
  z.object({ kind: z.literal('quiz'), id: Slug.max(120) }).strict(),
  z.object({ kind: z.literal('search'), from: z.enum(SEARCH_CONTEXTS) }).strict(),
]);
export type UsageOpenRequest = z.infer<typeof UsageOpenRequest>;
export const UsageOpenAck = z.object({ ok: z.literal(true) });

/**
 * A page that failed in a browser, without who: `boot` the app did not start (the page stayed blank), `chunk` a file
 * of the app did not load, `render` React caught an error, `unhandled` an error or a rejection nothing caught.
 */
export const CLIENT_ERROR_KINDS = ['boot', 'chunk', 'render', 'unhandled'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export const ClientErrorReport = z
  .object({
    kind: z.enum(CLIENT_ERROR_KINDS),
    /** The path alone: no query nor hash, which could carry a search or a token. */
    page: z
      .string()
      .max(200)
      .regex(/^\/[^?#\s]*$/),
    message: z.string().max(300),
    /** The hash of the entry file, which says which deploy the page was running; empty in development. */
    version: z
      .string()
      .max(40)
      .regex(/^[A-Za-z0-9_-]*$/),
  })
  .strict();
export type ClientErrorReport = z.infer<typeof ClientErrorReport>;

/** The errors of the last days, grouped by what failed and where. */
export const ClientErrorGroup = ClientErrorReport.extend({
  count: z.number().int().nonnegative(),
  lastSeen: z.iso.datetime({ offset: true }),
});
export type ClientErrorGroup = z.infer<typeof ClientErrorGroup>;

/** The days the panel shows of errors. */
export const CLIENT_ERROR_DAYS = 7;
export type UsageOpenAck = z.infer<typeof UsageOpenAck>;

const Day = z.iso.date();

/** What the Workers free plan takes in a day, counted over the whole Cloudflare account and reset at midnight UTC. */
export const WORKER_DAILY_REQUESTS = 100_000;
/** How many days back «Pedidos al Worker» goes, today included. */
export const WORKER_REQUEST_DAYS = 14;

/** The Worker's requests of one UTC day (the day of the free plan's limit, not the site's day). */
export const WorkerRequestDay = z.object({ day: Day, requests: z.number().int().nonnegative() });
export type WorkerRequestDay = z.infer<typeof WorkerRequestDay>;

const PeriodTotals = <T extends z.ZodType>(f: T) => z.object({ today: f, last7: f, last30: f });

const GroupFigures = z.object({
  students: z.number().int().min(USAGE_MIN_STUDENTS),
  ankiAnswers: UsageCount,
  newCards: UsageCount,
  roundsStarted: UsageCount,
  roundsFinished: UsageCount,
});

export const UsageOpens = z.object({
  totals: PeriodTotals(UsageOpenFigures),
  days: z.array(UsageOpenFigures.extend({ day: Day })),
  top: z.array(
    z.object({
      kind: z.enum(['note', 'deck', 'quiz']),
      id: z.string(),
      opens: z.number().int().min(USAGE_MIN_STUDENTS),
    }),
  ),
  searches: z.array(z.object({ context: z.enum(SEARCH_CONTEXTS), count: UsageCount })),
});
export type UsageOpens = z.infer<typeof UsageOpens>;

export const UsageReport = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  /** In Santiago, from 4:00 to 4:00, like Anki's day. */
  today: Day,
  timeZone: z.string(),
  minStudents: z.number().int().positive(),
  totals: PeriodTotals(UsageFigures),
  days: z.array(UsageFigures.extend({ day: Day })),
  weeks: z.array(UsageFigures.extend({ week: Day })),
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
  // Null when one part is 1 to 4 students: with `eligible` exact, subtraction would give it away.
  activation: z.object({
    eligible: UsageCount,
    activated: UsageCount.nullable(),
    notActivated: UsageCount.nullable(),
    percent: z.number().int().min(0).max(100).nullable(),
  }),
  opens: UsageOpens.nullable(),
  opensStatus: z.enum(['ok', 'not_configured', 'unavailable']),
  /** Null when they could not be read (no Analytics Engine token, or its query failed): `opensStatus` does not say it. */
  clientErrors: z.array(ClientErrorGroup).nullable(),
  /** Oldest first; null when they could not be read (no Analytics token, or its query failed). */
  workerRequests: z.array(WorkerRequestDay).nullable(),
});
export type UsageReport = z.infer<typeof UsageReport>;

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
