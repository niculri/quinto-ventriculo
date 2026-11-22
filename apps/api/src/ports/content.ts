// How the API reads the material of the content database (the published schema or the draft's mirror).
import type {
  CardChanges,
  CardDetail,
  Catalog,
  Course,
  Note,
  QuizDetail,
  QuizSummary,
  SearchResult,
} from '@qv/schema';

/** Sent as it comes: parsing several MB again would take more CPU than a Worker request has. */
export type JsonBody = string | ReadableStream<Uint8Array>;

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
