// Every request of the web's API clients goes to a route of API_ROUTES with its method, and every route has a client
// here, save the ones listed in OTHER_CLIENTS. With `routes.test.ts` of the API, it is the contract between both sides.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_PREFIX, API_ROUTES, PREVIEW_HEADER, PREVIEW_VALUE } from '@qv/schema/http';
import type { PublishRequest } from '@qv/schema';
import type { ApiRouteName } from '@qv/schema/http';
import { thumbUrl } from '../features/cards/model/thumbs';
import { PREVIEW_HEADERS, createApiClient } from '../shared/lib/api';
import type { ApiClient } from '../shared/lib/api';

/** Routes no client of the web asks for, and who does. */
const OTHER_CLIENTS: Partial<Record<ApiRouteName, string>> = {
  health: '`npm run smoke`, after each deploy',
  deepHealth: 'the external monitor (and `npm run smoke`)',
  me: '`npm run smoke`, to check that a session is asked for',
};

const FP = 'f'.repeat(32);
const PUBLISH: PublishRequest = {
  fingerprint: FP,
  title: 'Título',
  checks: { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] },
};

/** One call of each method: the type makes a new method of the client fail here until it has its call. */
const CALLS: { [K in keyof ApiClient]: (api: ApiClient) => Promise<unknown> } = {
  catalog: (api) => api.catalog(),
  note: (api) => api.note('a-b'),
  deck: (api) => api.deck('1'),
  ankiNotes: (api) => api.ankiNotes(),
  cardIndex: (api) => api.cardIndex('curso/certamen-1', '0123456789abcdef0123456789abcdef'),
  thumbSignature: (api) => api.thumbSignature(),
  cardChanges: (api) => api.cardChanges(7),
  card: (api) => api.card('a/b%c?d', 1),
  quizzes: (api) => api.quizzes({ course: 'curso', assessment: 'curso/certamen-1' }),
  quiz: (api) => api.quiz('practica'),
  quizSection: (api) => api.quizSection('practica', 'pautas'),
  siteSettings: (api) => api.siteSettings(),
  setSiteSettings: (api) => api.setSiteSettings({ hideEmptySemesters: true }),
  unpublishedLog: (api) => api.unpublishedLog(),
  usage: (api) => api.usage(),
  usageOpen: (api) => api.usageOpen({ kind: 'search', from: 'home' }),
  releaseOverview: (api) => api.releaseOverview(),
  releaseCards: (api) => api.releaseCards('curso/certamen-1', 'x'),
  releaseArticles: (api) => api.releaseArticles('curso/certamen-1', null),
  releaseQuestions: (api) => api.releaseQuestions('curso/certamen-1', null),
  releaseTexts: (api) => api.releaseTexts('x'),
  releaseMedia: (api) => api.releaseMedia(null),
  setReleaseMark: (api) => api.setReleaseMark(FP, 'phone', true),
  publishRelease: (api) => api.publishRelease(PUBLISH),
  revertRelease: (api) => api.revertRelease(3),
  releaseLog: (api) => api.releaseLog(),
  search: (api) => api.search('ribosoma', 5),
};

/** A Hono pattern as a regular expression: `:name` is one segment, `:name{re}` its expression. */
const matcher = (pattern: string) =>
  new RegExp(
    `^${(API_PREFIX + pattern)
      .split(/(:\w+(?:\{[^}]*\})?)/)
      .map((part, i) =>
        i % 2 === 1
          ? `(${/\{([^}]*)\}/.exec(part)?.[1] ?? '[^/]+'})`
          : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('')}$`,
  );

const ROUTES = Object.entries(API_ROUTES).map(([name, r]) => ({
  name: name as ApiRouteName,
  method: r.method,
  matches: matcher(r.pattern),
}));

/** The route of a request (without its query), or null. */
function routeOf(method: string, url: string): ApiRouteName | null {
  const path = new URL(url, 'https://sitio.test').pathname;
  const found = ROUTES.filter((r) => r.method === method && r.matches.test(path));
  return found.length === 1 ? found[0]!.name : null;
}

interface Request {
  method: string;
  url: string;
  headers: Headers;
}

async function requestsOf(call: (api: ApiClient) => Promise<unknown>, headers = {}) {
  const sent: Request[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    sent.push({ method: init.method ?? 'GET', url, headers: new Headers(init.headers) });
    return new Response('{"error":"internal","message":"x"}', { status: 500 });
  });
  await call(createApiClient(async () => 'token', '', headers)).catch(() => undefined);
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the web asks only for routes the API serves', () => {
  it('each method of the client goes to one route, with its method', async () => {
    const asked = new Set<ApiRouteName>();
    for (const [name, call] of Object.entries(CALLS)) {
      const sent = await requestsOf(call);
      expect(sent, name).toHaveLength(1);
      const route = routeOf(sent[0]!.method, sent[0]!.url);
      expect(route, `${name}: ${sent[0]!.method} ${sent[0]!.url}`).not.toBeNull();
      asked.add(route!);
    }
    expect(Object.keys(CALLS).sort()).toEqual(
      Object.keys(createApiClient(async () => null)).sort(),
    );
    // The browser's thumbnails: an <img> with the signature of `thumbSignature`.
    const thumb = routeOf('GET', thumbUrl('cards/thumb/a.webp', 'e=1&p=cards%2Fthumb%2F&s=x'));
    expect(thumb).toBe('media');
    asked.add(thumb!);
    const unasked = ROUTES.map((r) => r.name).filter((n) => !asked.has(n) && !OTHER_CLIENTS[n]);
    expect(unasked).toEqual([]);
    expect(Object.keys(OTHER_CLIENTS).filter((n) => asked.has(n as ApiRouteName))).toEqual([]);
  });

  it('the preview client sends the header the API reads', async () => {
    const [sent] = await requestsOf((api) => api.catalog(), PREVIEW_HEADERS);
    expect(sent!.headers.get(PREVIEW_HEADER)).toBe(PREVIEW_VALUE);
  });
});
