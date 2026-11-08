import type { z } from 'zod';
import {
  ApiError,
  BrowseData,
  CardChanges,
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
} from '@qv/schema';
import type { PublishRequest, ReleaseItemKind, ReleaseMarkId } from '@qv/schema';

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

/** The header that asks the API for the draft (step 1.7): only an administrator gets it. */
export const PREVIEW_HEADERS = { 'X-QV-Preview': 'draft' } as const;

/**
 * `/api` client. Sends the session token and validates every response with its schema. `headers`: the preview's
 * (`PREVIEW_HEADERS`); then nothing is taken from nor left in the browser's cache.
 */
export function createApiClient(
  getToken: GetToken,
  base = '',
  headers: Record<string, string> = {},
) {
  const preview = Object.keys(headers).length > 0;
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    init: { method?: string; body?: unknown; fresh?: boolean } = {},
  ): Promise<T> {
    const token = await getToken();
    let r: Response;
    try {
      r = await fetch(`${base}${path}`, {
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
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new ApiRequestError(
        0,
        'offline',
        'No hay conexión con el servidor. Revisa tu internet.',
      );
    }
    const body: unknown = await r.json().catch(() => null);
    if (!r.ok) {
      const e = ApiError.safeParse(body);
      throw new ApiRequestError(
        r.status,
        e.success ? e.data.error : 'unknown',
        e.success ? e.data.message : 'El servidor respondió con un error. Intenta de nuevo.',
      );
    }
    return schema.parse(body);
  }

  return {
    /** `fresh`: not the copy the browser keeps (a minute), e.g. right after changing the site's settings. */
    catalog: (signal?: AbortSignal, options: { fresh?: boolean } = {}) =>
      request('/api/catalog', Catalog, signal, options.fresh ? { fresh: true } : {}),
    note: (slug: string, signal?: AbortSignal) =>
      request(`/api/notes/${encodeURIComponent(slug)}`, Note, signal),
    deck: (id: string, signal?: AbortSignal) =>
      request(`/api/decks/${encodeURIComponent(id)}`, DeckDetail, signal),
    /** Every published note, light, for the browser. */
    ankiNotes: (signal?: AbortSignal) => request('/api/anki/notes', BrowseData, signal),
    /** The cards that moved to another deck or were taken out after the change `since` (a page). */
    cardChanges: (since: number, signal?: AbortSignal) =>
      request(`/api/anki/card-changes?since=${since}`, CardChanges, signal),
    /** The guid is Anki's: it may have «/», «%», «?»… (it travels encoded). */
    card: (noteGuid: string, ord: number, signal?: AbortSignal) =>
      request(`/api/cards/${encodeURIComponent(noteGuid)}/${ord}`, CardDetail, signal),
    /** The practice tests of a course or an assessment. */
    quizzes: (filter: { course?: string; assessment?: string } = {}, signal?: AbortSignal) =>
      request(
        `/api/quizzes${Object.keys(filter).length ? `?${new URLSearchParams(filter)}` : ''}`,
        QuizIndex,
        signal,
      ),
    /** A test, by its id: its sections (tabs) and groups, without the questions. */
    quiz: (id: string, signal?: AbortSignal) =>
      request(`/api/quizzes/${encodeURIComponent(id)}`, QuizDetail, signal),
    /** The questions of a section, by group, with signed URLs for the photos. */
    quizSection: (id: string, sectionId: string, signal?: AbortSignal) =>
      request(
        `/api/quizzes/${encodeURIComponent(id)}/sections/${encodeURIComponent(sectionId)}`,
        QuizSectionDetail,
        signal,
      ),
    // ── The site's settings (step 1.8): only for an administrator (anybody else gets 404) ──
    siteSettings: (signal?: AbortSignal) =>
      request('/api/admin/site-settings', SiteSettings, signal),
    setSiteSettings: (body: { hideEmptySemesters: boolean }) =>
      request('/api/admin/site-settings', SiteSettings, undefined, { method: 'PUT', body }),
    // ── Releases (step 1.7): only for an administrator (anybody else gets 404) ──
    /** What the draft changes, and the content version the site on line understands. */
    releaseOverview: (signal?: AbortSignal) =>
      request('/api/admin/release', ReleaseOverview, signal),
    /** A page of one kind of change of one assessment. */
    releaseCards: (assessment: string, after: string | null, signal?: AbortSignal) =>
      request(itemsPath(assessment, 'card', after), ReleaseCardPage, signal),
    releaseArticles: (assessment: string, after: string | null, signal?: AbortSignal) =>
      request(itemsPath(assessment, 'article', after), ReleaseArticlePage, signal),
    releaseQuestions: (assessment: string, after: string | null, signal?: AbortSignal) =>
      request(itemsPath(assessment, 'question', after), ReleaseQuestionPage, signal),
    /** A page of the texts the draft adds or changes. */
    releaseTexts: (after: string | null, signal?: AbortSignal) =>
      request(
        `/api/admin/release/texts${after ? `?${new URLSearchParams({ after })}` : ''}`,
        ReleaseTextPage,
        signal,
      ),
    /** A page of the new images, and which of them the store does not have. */
    releaseMedia: (after: string | null, signal?: AbortSignal) =>
      request(
        `/api/admin/release/media${after ? `?${new URLSearchParams({ after })}` : ''}`,
        ReleaseMediaPage,
        signal,
      ),
    /** Checks or unchecks a mark by hand, for the draft with that fingerprint (409 if it changed). */
    setReleaseMark: (fingerprint: string, mark: ReleaseMarkId, checked: boolean) =>
      request('/api/admin/release/marks', ReleaseMarks, undefined, {
        method: 'PUT',
        body: { fingerprint, mark, checked },
      }),
    /** Publishes the draft the panel showed (step 1.7, part 3): 409 if it changed, 422 if something stops it. */
    publishRelease: (body: PublishRequest) =>
      request('/api/admin/release/publish', PublishResult, undefined, { method: 'POST', body }),
    /** Undoes the last publication (409 if it is not the last one any more, or what is published changed). */
    revertRelease: (id: number) =>
      request('/api/admin/release/revert', RevertResult, undefined, {
        method: 'POST',
        body: { id },
      }),
    /** The publications, newest first. */
    releaseLog: (signal?: AbortSignal) => request('/api/admin/releases', ReleaseLog, signal),
    search: (query: string, limit = 20, signal?: AbortSignal) =>
      request(
        `/api/search?${new URLSearchParams({ q: query, limit: String(limit) })}`,
        SearchResponse,
        signal,
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

const itemsPath = (assessment: string, kind: ReleaseItemKind, after: string | null) =>
  `/api/admin/release/items?${new URLSearchParams({ assessment, kind, ...(after ? { after } : {}) })}`;
