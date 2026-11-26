// The API's routes: the method and pattern the Worker serves (Hono's syntax, under API_PREFIX) and the path the web
// asks for. A contract test in the web checks that both sides use exactly these.
import type { ReleaseItemKind } from '../release/release';
import { PUBLISHED_SOURCE } from './requests';

export const API_PREFIX = '/api';

type Method = 'GET' | 'PUT' | 'POST';
const route = <M extends Method, P extends string>(method: M, pattern: P) => ({ method, pattern });

export const API_ROUTES = {
  health: route('GET', '/health'),
  deepHealth: route('GET', '/health/deep'),
  me: route('GET', '/me'),
  catalog: route('GET', '/catalog'),
  note: route('GET', '/notes/:slug'),
  search: route('GET', '/search'),
  deck: route('GET', '/decks/:id'),
  cardIndex: route('GET', '/anki/index/:course/:assessment/:hash'),
  thumbs: route('GET', '/anki/thumbs'),
  cardChanges: route('GET', '/anki/card-changes'),
  card: route('GET', '/cards/:noteGuid/:ord'),
  quizzes: route('GET', '/quizzes'),
  quiz: route('GET', '/quizzes/:id'),
  quizSection: route('GET', '/quizzes/:id/sections/:sectionId'),
  siteSettings: route('GET', '/admin/site-settings'),
  setSiteSettings: route('PUT', '/admin/site-settings'),
  unpublished: route('GET', '/admin/unpublished'),
  usageOpen: route('POST', '/usage/open'),
  clientError: route('POST', '/client-error'),
  usage: route('GET', '/admin/usage'),
  release: route('GET', '/admin/release'),
  releaseItems: route('GET', '/admin/release/items'),
  releaseTexts: route('GET', '/admin/release/texts'),
  releaseMedia: route('GET', '/admin/release/media'),
  releaseMarks: route('PUT', '/admin/release/marks'),
  publishRelease: route('POST', '/admin/release/publish'),
  revertRelease: route('POST', '/admin/release/revert'),
  releaseLog: route('GET', '/admin/releases'),
  news: route('GET', '/news'),
  announcements: route('GET', '/admin/announcements'),
  saveAnnouncement: route('POST', '/admin/announcements'),
  withdrawAnnouncement: route('POST', '/admin/announcements/withdraw'),
  media: route('GET', '/media/:key{.+}'),
} as const;

export type ApiRouteName = keyof typeof API_ROUTES;

/** Puts each value in its `:name` in one pass, as it comes: the caller encodes what needs it. */
function fill(pattern: string, values: Record<string, string | number> = {}): string {
  return (
    API_PREFIX + pattern.replace(/:(\w+)(?:\{[^}]*\})?/g, (_, name: string) => String(values[name]))
  );
}

const R = API_ROUTES;
/** The admin mode's way to ask for what the students have (see `PublishedSource`). */
const asPublished = (path: string, published: boolean) =>
  published ? `${path}?source=${PUBLISHED_SOURCE}` : path;
const after = (path: string, value: string | null) =>
  `${path}${value ? `?${new URLSearchParams({ after: value }).toString()}` : ''}`;

/** The path of each route, with its query. Anki's guids may have «/», «%» or «?»: they travel encoded. */
export const apiPaths = {
  catalog: (published = false) => asPublished(fill(R.catalog.pattern), published),
  note: (slug: string) => fill(R.note.pattern, { slug: encodeURIComponent(slug) }),
  search: (query: string, limit: number) =>
    `${fill(R.search.pattern)}?${new URLSearchParams({ q: query, limit: String(limit) }).toString()}`,
  deck: (id: string, published = false) =>
    asPublished(fill(R.deck.pattern, { id: encodeURIComponent(id) }), published),
  /** The assessment's id is `course/assessment`: it fills two segments, as it is. */
  cardIndex: (assessmentId: string, hash: string) =>
    fill(R.cardIndex.pattern.replace(':course/:assessment', ':assessmentId'), {
      assessmentId,
      hash,
    }),
  thumbs: () => fill(R.thumbs.pattern),
  cardChanges: (since: number) => `${fill(R.cardChanges.pattern)}?since=${since}`,
  card: (noteGuid: string, ord: number, published = false) =>
    asPublished(fill(R.card.pattern, { noteGuid: encodeURIComponent(noteGuid), ord }), published),
  quizzes: (filter: { course?: string; assessment?: string }) =>
    `${fill(R.quizzes.pattern)}${Object.keys(filter).length ? `?${new URLSearchParams(filter).toString()}` : ''}`,
  quiz: (id: string, published = false) =>
    asPublished(fill(R.quiz.pattern, { id: encodeURIComponent(id) }), published),
  quizSection: (id: string, sectionId: string, published = false) =>
    asPublished(
      fill(R.quizSection.pattern, {
        id: encodeURIComponent(id),
        sectionId: encodeURIComponent(sectionId),
      }),
      published,
    ),
  siteSettings: () => fill(R.siteSettings.pattern),
  unpublished: () => fill(R.unpublished.pattern),
  usageOpen: () => fill(R.usageOpen.pattern),
  clientError: () => fill(R.clientError.pattern),
  usage: () => fill(R.usage.pattern),
  release: () => fill(R.release.pattern),
  releaseItems: (assessment: string, kind: ReleaseItemKind, afterKey: string | null) =>
    `${fill(R.releaseItems.pattern)}?${new URLSearchParams({ assessment, kind, ...(afterKey ? { after: afterKey } : {}) }).toString()}`,
  releaseTexts: (afterKey: string | null) => after(fill(R.releaseTexts.pattern), afterKey),
  releaseMedia: (afterKey: string | null) => after(fill(R.releaseMedia.pattern), afterKey),
  releaseMarks: () => fill(R.releaseMarks.pattern),
  publishRelease: () => fill(R.publishRelease.pattern),
  revertRelease: () => fill(R.revertRelease.pattern),
  releaseLog: () => fill(R.releaseLog.pattern),
  news: () => fill(R.news.pattern),
  announcements: () => fill(R.announcements.pattern),
  withdrawAnnouncement: () => fill(R.withdrawAnnouncement.pattern),
  /** Without the signature: the Worker adds `?e=…&s=…`, or the browser's thumbnail signature. */
  media: (key: string) => fill(R.media.pattern, { key }),
};
