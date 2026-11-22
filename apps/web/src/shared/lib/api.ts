// The client of the site's `/api`: it sends the session token and validates every response with its schema.
import type { z } from 'zod';
import {
  ApiError,
  CardChanges,
  CardIndex,
  CardDetail,
  Catalog,
  DeckDetail,
  Note,
  QuizDetail,
  QuizIndex,
  QuizSectionDetail,
  PublishResult,
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
} from '@qv/schema';
import { PREVIEW_HEADER, PREVIEW_VALUE, apiPaths } from '@qv/schema/http';
import type {
  PublishRequest,
  ReleaseMarkId,
  SiteSettingsUpdate,
  UsageOpenRequest,
} from '@qv/schema';
import { apiStrings } from './strings/api.strings';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
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

/** What `fetch` gets: the headers of the mode, the token, the body and how the browser's cache is used. */
function fetchInit(
  headers: Record<string, string>,
  token: string | null,
  init: RequestOptions,
  signal?: AbortSignal,
): RequestInit {
  const preview = Object.keys(headers).length > 0;
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.method ? { method: init.method } : {}),
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    ...(preview
      ? { cache: 'no-store' as const }
      : init.fresh
        ? { cache: 'no-cache' as const }
        : {}),
    ...(signal ? { signal } : {}),
    ...(init.keepalive ? { keepalive: true } : {}),
  };
}

function requester(getToken: GetToken, base: string, headers: Record<string, string>) {
  return async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    init: RequestOptions = {},
  ): Promise<T> {
    const token = await getToken();
    let r: Response;
    try {
      r = await fetch(`${base}${path}`, fetchInit(headers, token, init, signal));
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new ApiRequestError(0, 'offline', apiStrings.errors.offline);
    }
    const body: unknown = await r.json().catch(() => null);
    if (!r.ok) {
      const e = ApiError.safeParse(body);
      throw new ApiRequestError(
        r.status,
        e.success ? e.data.error : 'unknown',
        e.success ? e.data.message : apiStrings.errors.server,
      );
    }
    return schema.parse(body);
  };
}

/** With the admin mode's `headers`, nothing is taken from nor left in the browser's cache. */
export function createApiClient(
  getToken: GetToken,
  base = '',
  headers: Record<string, string> = {},
) {
  const request = requester(getToken, base, headers);

  return {
    /**
     * `fresh`: not the copy the browser keeps (a minute), e.g. right after changing the site's settings. `published`:
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
      request(apiPaths.publishRelease(), PublishResult, undefined, { method: 'POST', body }),
    /** Undoes the last publication (409 if it is not the last one any more, or what is published changed). */
    revertRelease: (id: number) =>
      request(apiPaths.revertRelease(), RevertResult, undefined, {
        method: 'POST',
        body: { id },
      }),
    releaseLog: (signal?: AbortSignal) => request(apiPaths.releaseLog(), ReleaseLog, signal),
    search: (query: string, limit = 20, signal?: AbortSignal) =>
      request(apiPaths.search(query, limit), SearchResponse, signal),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
