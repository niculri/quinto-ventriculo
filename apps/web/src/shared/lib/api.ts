// The client of the site's `/api`: it sends the session token and validates every response with its schema.
import type { z } from 'zod';
import {
  AdminAnnouncement,
  AdminAnnouncements,
  ApiError,
  CardChanges,
  CardIndex,
  CardQualityReport,
  CardDetail,
  Catalog,
  DeckDetail,
  Note,
  QuizDetail,
  QuizIndex,
  QuizSectionDetail,
  NewsFeed,
  PublishResponse,
  ReleaseArticlePage,
  ReleaseCardPage,
  ReleaseLog,
  ReleaseMarks,
  ReleaseMediaPage,
  ReleaseOverview,
  ReleaseQuestionPage,
  ReleaseTextPage,
  RevertResult,
  SearchResponse,
  SiteSettings,
  SiteSettingsView,
  ThumbSignature,
  UnpublishedLog,
  UsageOpenAck,
  UsageReport,
  ClientErrorsReport,
} from '@qv/schema';
import { PREVIEW_HEADER, PREVIEW_VALUE, apiPaths } from '@qv/schema/http';
import type {
  ClientErrorPeriod,
  PublishRequest,
  SaveAnnouncementRequest,
  ReleaseMarkId,
  SiteSettingsUpdate,
  UsageOpenRequest,
} from '@qv/schema';
import { keptAnswers } from './keptAnswers';
import { secondsNow } from './signedMedia';
import { stableMedia } from './stableMedia';
import type { StableMedia } from './stableMedia';
import type { KeptAnswer, KeptAnswers } from './keptAnswers';
import { apiStrings } from './strings/api.strings';

export class ApiRequestError extends Error {
  /** `retryAfter`: the seconds a 429 asks to wait (its `Retry-After`), null for any other answer. */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export type GetToken = () => Promise<string | null>;

/** The header that asks the API for the draft: only an administrator gets it. */
export const PREVIEW_HEADERS = { [PREVIEW_HEADER]: PREVIEW_VALUE } as const;

interface RequestOptions {
  method?: string;
  body?: unknown;
  fresh?: boolean;
  keepalive?: boolean;
}

/** How a read uses the copies: the one this client kept (its validator), none at all, or the browser's. */
type CopyUse = { validator: string } | 'none' | 'browser';

/** What `fetch` gets: the headers of the mode, the token, the body and how the browser's cache is used. */
function fetchInit(
  headers: Record<string, string>,
  token: string | null,
  init: RequestOptions,
  copy: CopyUse,
  signal?: AbortSignal,
): RequestInit {
  const preview = Object.keys(headers).length > 0;
  const validator = typeof copy === 'object' ? copy.validator : null;
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(validator ? { 'If-None-Match': validator } : {}),
    },
    ...(init.method ? { method: init.method } : {}),
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    // With its own validator the browser's copy is not used: a 304 has to reach this client.
    ...(preview || validator
      ? { cache: 'no-store' as const }
      : copy === 'none'
        ? { cache: 'reload' as const }
        : {}),
    ...(signal ? { signal } : {}),
    ...(init.keepalive ? { keepalive: true } : {}),
  };
}

/** `Retry-After` in seconds; the date form and anything else count as unknown. */
function retryAfterSeconds(header: string | null): number | null {
  return header && /^\d{1,6}$/.test(header) ? Number(header) : null;
}

function requestError(r: Response, body: unknown): ApiRequestError {
  const e = ApiError.safeParse(body);
  return new ApiRequestError(
    r.status,
    e.success ? e.data.error : 'unknown',
    e.success ? e.data.message : apiStrings.errors.server,
    r.status === 429 ? retryAfterSeconds(r.headers.get('Retry-After')) : null,
  );
}

function copyUse(
  kept: KeptAnswers | null,
  path: string,
  init: RequestOptions,
): { copy: CopyUse; previous: KeptAnswer | undefined } {
  if (!kept || init.method) return { copy: 'browser', previous: undefined };
  if (init.fresh || kept.mustReload(path)) return { copy: 'none', previous: undefined };
  const previous = kept.get(path);
  return { copy: previous ? { validator: previous.tag } : 'browser', previous };
}

/** The later of this clock and the API's: a clock that runs late here would hand out links the API already refuses. */
function nowFor(r: Response): number {
  const api = Date.parse(r.headers.get('Date') ?? '');
  return Math.max(secondsNow(), Number.isNaN(api) ? 0 : Math.floor(api / 1000));
}

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function requester(
  getToken: GetToken,
  base: string,
  headers: Record<string, string>,
  kept: KeptAnswers | null,
  links: StableMedia,
) {
  return async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    init: RequestOptions = {},
  ): Promise<T> {
    const token = await getToken();
    const { copy, previous } = copyUse(kept, path, init);
    // The kept answer is the one parsed with this same schema for this path.
    const reuse = () => previous!.data as T;
    let r: Response;
    try {
      r = await fetch(`${base}${path}`, fetchInit(headers, token, init, copy, signal));
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      // Checking again an answer already shown: without a connection it stays, as before checking.
      if (previous) return reuse();
      throw new ApiRequestError(0, 'offline', apiStrings.errors.offline);
    }
    // Unchanged, or the API could not check it now (too many requests in a row, or down): what was shown stays.
    if (previous && (r.status === 304 || r.status === 429 || r.status >= 500)) return reuse();
    const text = await r.text().catch(() => '');
    if (!r.ok) throw requestError(r, jsonOf(text));
    const linked = links(text, nowFor(r));
    const data = schema.parse(jsonOf(linked));
    // With links of an earlier answer its validator no longer says what it carries: a 304 would keep links that expire.
    if (kept && !init.method) kept.keep(path, linked === text ? r.headers.get('ETag') : null, data);
    return data;
  };
}

/** The news a student reads, and the panel's announcements. */
const announcementMethods = (request: ReturnType<typeof requester>) => ({
  /** The announcements the student may read, newest first. */
  news: (signal?: AbortSignal) => request(apiPaths.news(), NewsFeed, signal),
  announcements: (signal?: AbortSignal) =>
    request(apiPaths.announcements(), AdminAnnouncements, signal),
  saveAnnouncement: (body: SaveAnnouncementRequest) =>
    request(apiPaths.announcements(), AdminAnnouncement, undefined, { method: 'POST', body }),
  withdrawAnnouncement: (id: number) =>
    request(apiPaths.withdrawAnnouncement(), AdminAnnouncement, undefined, {
      method: 'POST',
      body: { id },
    }),
});

/** With the admin mode's `headers`, nothing is taken from nor left in the browser's cache. */
export function createApiClient(
  getToken: GetToken,
  base = '',
  headers: Record<string, string> = {},
) {
  // The admin mode's answers are never kept: the draft has no validator.
  const kept = Object.keys(headers).length > 0 ? null : keptAnswers();
  const request = requester(getToken, base, headers, kept, stableMedia());

  const client = {
    /**
     * `fresh`: from the API, past every copy, e.g. right after changing the site's settings. `published`:
     * only in the admin mode, the catalog as the students have it.
     */
    catalog: (signal?: AbortSignal, options: { fresh?: boolean; published?: boolean } = {}) =>
      request(
        apiPaths.catalog(options.published),
        Catalog,
        signal,
        options.fresh ? { fresh: true } : {},
      ),
    note: (slug: string, signal?: AbortSignal) => request(apiPaths.note(slug), Note, signal),
    /** `published`: only in the admin mode, the deck as the students have it (without the cards only the draft has). */
    deck: (id: string, signal?: AbortSignal, options: { published?: boolean } = {}) =>
      request(apiPaths.deck(id, options.published), DeckDetail, signal),
    cardIndex: (assessmentId: string, hash: string, signal?: AbortSignal) =>
      request(apiPaths.cardIndex(assessmentId, hash), CardIndex, signal),
    /** One signature for every thumbnail of the browser: `apiPaths.media(<thumb>)?<query>`. */
    thumbSignature: (signal?: AbortSignal) => request(apiPaths.thumbs(), ThumbSignature, signal),
    /** The cards that moved to another deck or were taken out after the change `since` (a page). */
    cardChanges: (since: number, signal?: AbortSignal) =>
      request(apiPaths.cardChanges(since), CardChanges, signal),
    /** The guid is Anki's: it may have «/», «%», «?»… (it travels encoded). */
    card: (
      noteGuid: string,
      ord: number,
      signal?: AbortSignal,
      options: { published?: boolean } = {},
    ) => request(apiPaths.card(noteGuid, ord, options.published), CardDetail, signal),
    quizzes: (filter: { course?: string; assessment?: string } = {}, signal?: AbortSignal) =>
      request(apiPaths.quizzes(filter), QuizIndex, signal),
    /** `published`: only in the admin mode, the test as the students have it (without the questions only the draft has). */
    quiz: (id: string, signal?: AbortSignal, options: { published?: boolean } = {}) =>
      request(apiPaths.quiz(id, options.published), QuizDetail, signal),
    quizSection: (
      id: string,
      sectionId: string,
      signal?: AbortSignal,
      options: { published?: boolean } = {},
    ) => request(apiPaths.quizSection(id, sectionId, options.published), QuizSectionDetail, signal),
    siteSettings: (signal?: AbortSignal) =>
      request(apiPaths.siteSettings(), SiteSettingsView, signal),
    setSiteSettings: (body: SiteSettingsUpdate) =>
      request(apiPaths.siteSettings(), SiteSettings, undefined, { method: 'PUT', body }),
    unpublishedLog: (signal?: AbortSignal) =>
      request(apiPaths.unpublished(), UnpublishedLog, signal),
    /** Usage figures, only of groups of 5 students or more. */
    usage: (signal?: AbortSignal) => request(apiPaths.usage(), UsageReport, signal),
    clientErrors: (days: ClientErrorPeriod, signal?: AbortSignal) =>
      request(apiPaths.clientErrors(days), ClientErrorsReport, signal),
    /** Which cards of a deck (and those below it) work, in sums of 5 students or more. */
    cardQuality: (deckId: string, signal?: AbortSignal) =>
      request(apiPaths.cardQuality(deckId), CardQualityReport, signal),
    /**
     * Counts, without who, a note, deck or test opened by its page, or a search completed. `keepalive`: it arrives even
     * if the page changes right after (a search that opens a result).
     */
    usageOpen: (body: UsageOpenRequest) =>
      request(apiPaths.usageOpen(), UsageOpenAck, undefined, {
        method: 'POST',
        body,
        keepalive: true,
      }),
    releaseOverview: (signal?: AbortSignal) => request(apiPaths.release(), ReleaseOverview, signal),
    releaseCards: (assessment: string, after: string | null, signal?: AbortSignal) =>
      request(apiPaths.releaseItems(assessment, 'card', after), ReleaseCardPage, signal),
    releaseArticles: (assessment: string, after: string | null, signal?: AbortSignal) =>
      request(apiPaths.releaseItems(assessment, 'article', after), ReleaseArticlePage, signal),
    releaseQuestions: (assessment: string, after: string | null, signal?: AbortSignal) =>
      request(apiPaths.releaseItems(assessment, 'question', after), ReleaseQuestionPage, signal),
    releaseTexts: (after: string | null, signal?: AbortSignal) =>
      request(apiPaths.releaseTexts(after), ReleaseTextPage, signal),
    releaseMedia: (after: string | null, signal?: AbortSignal) =>
      request(apiPaths.releaseMedia(after), ReleaseMediaPage, signal),
    setReleaseMark: (fingerprint: string, mark: ReleaseMarkId, checked: boolean) =>
      request(apiPaths.releaseMarks(), ReleaseMarks, undefined, {
        method: 'PUT',
        body: { fingerprint, mark, checked },
      }),
    /** Publishes the draft the panel showed: 409 if it changed, 422 if something stops it. */
    publishRelease: (body: PublishRequest) =>
      request(apiPaths.publishRelease(), PublishResponse, undefined, { method: 'POST', body }),
    /** Undoes the last publication (409 if it is not the last one any more, or what is published changed). */
    revertRelease: (id: number) =>
      request(apiPaths.revertRelease(), RevertResult, undefined, {
        method: 'POST',
        body: { id },
      }),
    releaseLog: (signal?: AbortSignal) => request(apiPaths.releaseLog(), ReleaseLog, signal),
    ...announcementMethods(request),
    search: (query: string, limit = 20, signal?: AbortSignal) =>
      request(apiPaths.search(query, limit), SearchResponse, signal),
  };
  if (kept) keptOf.set(client, kept);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Each client's kept answers, apart from its methods: every one of those is a request. */
const keptOf = new WeakMap<ApiClient, KeptAnswers>();

/** After publishing or undoing: every read of `api` comes again from the API, past every copy, once. */
export function forgetKeptAnswers(api: ApiClient) {
  keptOf.get(api)?.forget();
}
