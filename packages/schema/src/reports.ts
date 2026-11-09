/**
 * Reports of errors (step 2.6): one model for every content. The users' database keeps them (`content_reports`) and
 * decides; this is what the web and the tests share with it.
 */

/**
 * The limits, as `report_limits()` of the users' database says them (db/tests/reports.test.ts fails if they differ):
 * reports a day per person, and reports open per person in the same place (the same card, the same question of a
 * test, the same quote of an article). Each question of a test is a place of its own.
 */
export const REPORT_LIMITS = { perDay: 50, openPerPlace: 5 } as const;

/** What can be reported today. The database also knows 'wiki_page', 'gymkana_station' and 'site', for later. */
export const REPORT_KINDS = ['card', 'note', 'quiz_question'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_CATEGORIES = [
  'fact',
  'answer_key',
  'text',
  'image',
  'technical',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** The categories of each content, in the order the dialog offers them («La clave está mal» only in a test). */
export const CATEGORIES_OF: Record<ReportKind, readonly ReportCategory[]> = {
  card: ['fact', 'text', 'image', 'technical', 'other'],
  note: ['fact', 'text', 'image', 'technical', 'other'],
  quiz_question: ['answer_key', 'fact', 'text', 'image', 'technical', 'other'],
};

/** What the author decided for a content: it closes every open report of it at once. */
export const RESOLUTION_STATUSES = ['fixed', 'not_an_error', 'wont_fix'] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

/** At most this many characters of a quote of an article (the database cuts a longer one). */
export const QUOTE_MAX = 500;
/** Characters around a quote, to find it again (`prefix`, `suffix`). */
export const QUOTE_CONTEXT = 100;
/** A comment has 1 to this many characters. */
export const REPORT_COMMENT_MAX = 2000;
/** The note the student reads with the decision. */
export const RESOLUTION_NOTE_MAX = 500;
