// What the API counts of how the site is used: opens and searches as anonymous points, and the users' database figures.
import type { SearchContext, UsageEventKind } from '@qv/schema';

export interface UsageEvent {
  kind: UsageEventKind;
  path: string;
  context?: SearchContext;
}

/** Never awaited and never fails: a point lost is better than an answer changed. */
export interface UsageRecorder {
  record(event: UsageEvent): void;
}

export interface OpenCounts {
  hourly: { hour: string; kind: UsageEventKind; count: number }[];
  items: { kind: 'note' | 'deck' | 'quiz'; path: string; count: number }[];
  searches: { context: string; count: number }[];
}

export interface UsageOpensReader {
  read(): Promise<OpenCounts>;
}

/**
 * Each deck's unit, assessment and course, from the catalog: the users' database does not know the content. A type,
 * not an interface, so that it is the `Json` argument of `admin_usage()`.
 */
export type UsageGroups = {
  decks: Record<string, [string | null, string | null, string | null]>;
  quizzes: Record<string, [string | null, string | null]>;
};

export interface UsageStatsSource {
  stats(token: string, groups: UsageGroups): Promise<unknown>;
}
