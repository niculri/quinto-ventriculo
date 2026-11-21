// The interfaces through which the API reads and writes the content database, implemented for Supabase and in memory.
import type {
  CardChanges,
  CardDetail,
  Catalog,
  Course,
  Note,
  PublishResult,
  QuizDetail,
  QuizSummary,
  ReleaseChecks,
  ReleaseLog,
  ReleaseMark,
  RevertResult,
  SearchResult,
  SiteSettings,
  SiteSettingsUpdate,
  UnpublishedLog,
} from '@qv/schema';

/** Sent as it comes: parsing several MB again would take more CPU than a Worker request has. */
type JsonBody = string | ReadableStream<Uint8Array>;

export interface ContentRepository {
  catalog(): Promise<Catalog>;
  note(slug: string): Promise<Note | null>;
  /** `excluded`: ids of courses whose notes never come in the results, before the limit is applied. */
  search(query: string, limit: number, excluded?: readonly string[]): Promise<SearchResult[]>;
  deckJson(id: string): Promise<JsonBody | null>;
  cardChanges(since: number, limit: number): Promise<CardChanges>;
  card(noteGuid: string, ord: number): Promise<CardDetail | null>;
  quizzes(): Promise<QuizSummary[]>;
  quiz(id: string): Promise<QuizDetail | null>;
  quizSectionJson(id: string, sectionId: string): Promise<JsonBody | null>;
  /** Only what tells a course apart, without its material: a switch of a course checks against it. */
  courses(): Promise<Course[]>;
  /** The course a deck belongs to; null for the root and the semesters' decks, and for a deck that does not exist. */
  deckCourse(id: string): Promise<string | null>;
}

export interface ReleaseRepository {
  summaryJson(): Promise<JsonBody>;
  browseIndexesJson(): Promise<JsonBody>;
  itemsJson(
    assessment: string,
    kind: 'card' | 'article' | 'question',
    after: string | null,
  ): Promise<JsonBody>;
  textsJson(after: string | null): Promise<JsonBody>;
  media(after: string | null, limit: number): Promise<{ keys: string[]; next: string | null }>;
  setMark(
    fingerprint: string,
    mark: 'phone' | 'answers' | 'announcement',
    checked: boolean,
    by: string,
  ): Promise<ReleaseMark[] | 'stale'>;
  publish(input: PublishInput): Promise<{ ok: true; result: PublishResult } | Refused>;
  revert(id: number, by: string): Promise<{ ok: true; result: RevertResult } | Refused>;
  log(): Promise<ReleaseLog>;
}

/** A type, not an interface: it goes as the `jsonb` argument of publish_release(). */
export type PublishInput = {
  fingerprint: string;
  title: string;
  schemaVersion: number;
  checks: ReleaseChecks;
  marks: ('announcement' | 'phone' | 'answers')[];
  by: string;
};

export type Refused = { ok: false; reason: string; detail: string | null };

/** Outside the draft (it is not material): always the published schema's. */
export interface SiteSettingsRepository {
  get(): Promise<SiteSettings>;
  /** Changes only the keys it is given. */
  set(input: SiteSettingsUpdate & { by: string }): Promise<SiteSettings>;
}

export interface UnpublishedRepository {
  log(): Promise<UnpublishedLog>;
}
