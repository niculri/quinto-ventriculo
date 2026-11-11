import type {
  CardChanges,
  CardDetail,
  Catalog,
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
  UnpublishedLog,
} from '@qv/schema';

/**
 * A JSON body the API sends as it comes, without parsing it: a deck from the root or every note of the
 * browser is several MB, and parsing and writing it again would take more CPU than a Worker request has.
 */
export type JsonBody = string | ReadableStream<Uint8Array>;

/**
 * Access to the content database. The API only knows this interface: today there is a Supabase
 * implementation (Postgres + JSONB) and an in-memory one (development and tests); another database would be
 * another implementation.
 */
export interface ContentRepository {
  catalog(): Promise<Catalog>;
  /** Note by its slug, with the HTML as stored (images with `data-media`). */
  note(slug: string): Promise<Note | null>;
  search(query: string, limit: number): Promise<SearchResult[]>;
  /**
   * Anki deck with its subdecks and the list of its cards (and its subdecks'): a `DeckDetail` as JSON, or
   * null if there is no such deck.
   */
  deckJson(id: string): Promise<JsonBody | null>;
  /** Every note, light, for the browser (plain-text fields, tags, cards: no HTML): `BrowseData` as JSON. */
  browseJson(): Promise<JsonBody>;
  /**
   * The cards that moved to another deck or were taken out after the change `since` (at most `limit`), so that
   * each student's progress can follow them (`reconcile_cards()` in the users' database).
   */
  cardChanges(since: number, limit: number): Promise<CardChanges>;
  /** One card, with the HTML as stored (images with `data-media`) and its note type's CSS. */
  card(noteGuid: string, ord: number): Promise<CardDetail | null>;
  /** Every published practice test (for the catalog and the index of a course or assessment). */
  quizzes(): Promise<QuizSummary[]>;
  /** A test by its id, with its sections and groups but without the questions. */
  quiz(id: string): Promise<QuizDetail | null>;
  /**
   * The questions of a section of a test: a `QuizSectionDetail` as JSON (images with their key in `media`),
   * or null if there is no such test or section. Hundreds of questions with SVG figures: it is not parsed.
   */
  quizSectionJson(id: string, sectionId: string): Promise<JsonBody | null>;
}

/**
 * What the draft changes against what is published (step 1.7, part 2), for the release panel: the content database's
 * `release_*` functions. The big ones go as they come (the web validates them with `@qv/schema`).
 */
export interface ReleaseRepository {
  /** `release_summary()`: a `ReleaseSummary` as JSON. */
  summaryJson(): Promise<JsonBody>;
  /** `release_browse_index_changes()` (step 3.3): the card browser's indexes the draft changes, as JSON. */
  browseIndexesJson(): Promise<JsonBody>;
  /** `release_items()`: a page of one kind of change of one assessment, as JSON. */
  itemsJson(
    assessment: string,
    kind: 'card' | 'article' | 'question',
    after: string | null,
  ): Promise<JsonBody>;
  /** `release_texts()`: a page of the texts the draft adds or changes, as JSON. */
  textsJson(after: string | null): Promise<JsonBody>;
  /** `release_media()`: the images the draft's new or changed pieces use and their published version did not. */
  media(after: string | null, limit: number): Promise<{ keys: string[]; next: string | null }>;
  /**
   * Checks or unchecks a mark by hand for the draft with that fingerprint; `stale` if the draft is another one now.
   */
  setMark(
    fingerprint: string,
    mark: 'phone' | 'answers' | 'announcement',
    checked: boolean,
    by: string,
  ): Promise<ReleaseMark[] | 'stale'>;
  /**
   * `publish_release()` (step 1.7, part 3): the draft with that fingerprint goes to what is published, in one
   * transaction. `refused` with the database's reason if it does not (`fingerprint`, `marks`, `blocked`,
   * `schema_version`, `unpublished`, `imaios`, `empty`, `drift`, `unique`, `invalid`).
   */
  publish(input: PublishInput): Promise<{ ok: true; result: PublishResult } | Refused>;
  /**
   * `revert_release()`: undoes the last publication (`not_last`, `reverted`, `migrated`, `public_changed`, `invalid`).
   */
  revert(id: number, by: string): Promise<{ ok: true; result: RevertResult } | Refused>;
  /** `release_log()`: the publications, newest first. */
  log(): Promise<ReleaseLog>;
}

export interface PublishInput {
  fingerprint: string;
  title: string;
  /** The content version this Worker understands: the draft has to be of that one. */
  schemaVersion: number;
  checks: ReleaseChecks;
  /** The marks by hand that apply besides «phone» and «answers» (the announcement's comes with step C1). */
  marks: ('announcement' | 'phone' | 'answers')[];
  by: string;
}

export type Refused = { ok: false; reason: string; detail: string | null };

/**
 * How the site is shown (step 1.8): one row of the content database, outside the draft (it is not material). Always
 * the published schema's, also in the preview.
 */
export interface SiteSettingsRepository {
  get(): Promise<SiteSettings>;
  /** Only an administrator gets here (the API checks it); `by` is their email. */
  set(input: { hideEmptySemesters: boolean; by: string }): Promise<SiteSettings>;
}

/**
 * What was taken off the site (step 1.5), for «Fuera del sitio» in the administration panel (step 2.10): the record
 * of the content database (`unpublish_log_entries()`), only to look at. Always the published schema's.
 */
export interface UnpublishedRepository {
  /** The latest entries (at most 200), newest first; an image's `onSite` is null (the image store knows it). */
  log(): Promise<UnpublishedLog>;
}
