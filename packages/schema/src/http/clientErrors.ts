// Zod schemas of the pages that fail in the browsers: what a browser sends, and the groups the panel's «Errores» reads.
import { z } from 'zod';

/**
 * `boot` the app did not start (the page stayed blank), `chunk` a file of the app did not load, `render` React caught
 * an error, `unhandled` an error or a rejection nothing caught.
 */
export const CLIENT_ERROR_KINDS = ['boot', 'chunk', 'render', 'unhandled'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

/** What a browser sends; the fields after `version` are newer, so an older page that does not send them still counts. */
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
    /** The stack, already without the site's address: the app's files as `/assets/…js:line:column`. */
    stack: z.string().max(1500).default(''),
    /** The window, `390x844`. */
    viewport: z
      .string()
      .regex(/^(\d{1,5}x\d{1,5})?$/)
      .default(''),
  })
  .strict();
export type ClientErrorReport = z.infer<typeof ClientErrorReport>;

/** The periods the panel can show; Analytics Engine keeps the points three months. */
export const CLIENT_ERROR_PERIODS = [7, 30] as const;
export type ClientErrorPeriod = (typeof CLIENT_ERROR_PERIODS)[number];

export const ClientErrorsQuery = z.object({
  days: z
    .enum(['7', '30'])
    .default('30')
    .transform((d) => Number(d) as ClientErrorPeriod),
});

/**
 * One error (the same kind, page, message and deploy) in the period: how many times, when, the system, browser,
 * window and stack of its last time, the systems and browsers it showed in, and its accounts. An older point has no
 * system, browser, window, stack nor account: they are empty.
 */
export const ClientErrorGroup = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  page: z.string(),
  message: z.string(),
  version: z.string(),
  count: z.number().int().nonnegative(),
  firstSeen: z.iso.datetime({ offset: true }),
  lastSeen: z.iso.datetime({ offset: true }),
  os: z.string(),
  browser: z.string(),
  viewport: z.string(),
  /** Null when it is not known (an older point). */
  phone: z.boolean().nullable(),
  stack: z.string(),
  systems: z.array(z.string()),
  browsers: z.array(z.string()),
  /** Times without a session. */
  anonymous: z.number().int().nonnegative(),
  /** The distinct accounts that had it; `accounts` has at most `ERROR_ACCOUNTS_SHOWN` of them, the most frequent. */
  people: z.number().int().nonnegative(),
  accounts: z.array(z.uuid()),
});
export type ClientErrorGroup = z.infer<typeof ClientErrorGroup>;

export const ERROR_ACCOUNTS_SHOWN = 10;

export const ClientErrorsReport = z.object({
  days: z.union([z.literal(7), z.literal(30)]),
  /** Last first; at most `ERRORS_SHOWN`. */
  groups: z.array(ClientErrorGroup),
  /** Whether there could be more than the ones shown. */
  more: z.boolean(),
});
export type ClientErrorsReport = z.infer<typeof ClientErrorsReport>;

export const ERRORS_SHOWN = 100;
