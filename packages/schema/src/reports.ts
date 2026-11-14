// The error reports' kinds, categories and limits, which the web and the tests share with the users' database.

/** Has to match `report_limits()` of the users' database. */
export const REPORT_LIMITS = { perDay: 50, openPerPlace: 5 } as const;

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

export const CATEGORIES_OF: Record<ReportKind, readonly ReportCategory[]> = {
  card: ['fact', 'text', 'image', 'technical', 'other'],
  note: ['fact', 'text', 'image', 'technical', 'other'],
  quiz_question: ['answer_key', 'fact', 'text', 'image', 'technical', 'other'],
};

export const RESOLUTION_STATUSES = ['fixed', 'not_an_error', 'wont_fix'] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const QUOTE_MAX = 500;
export const QUOTE_CONTEXT = 100;
export const REPORT_COMMENT_MAX = 2000;
export const RESOLUTION_NOTE_MAX = 500;
