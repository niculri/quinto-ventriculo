// The API serves exactly the routes of API_ROUTES, with their method, once every optional part is configured. With
// `app/api-routes.test.ts` of the web, it is the contract between both sides.
import { describe, expect, it } from 'vitest';
import { API_PREFIX, API_ROUTES } from '@qv/schema/http';
import { createApp } from './app';
import { deepHealth } from './health';
import { MediaSigner } from './media';
import { memoryRepository } from './repositories/memory';
import { memorySiteSettings } from './repositories/memory-settings';
import type { ReleaseRepository, UnpublishedRepository } from './repository';
import type { UsageStatsSource } from './usage';

const EMPTY = {
  semesters: [],
  courses: [],
  assessments: [],
  notes: [],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
};

/** Every route is mounted with its dependency; none of these is called. */
const unused = new Proxy({}, { get: () => () => Promise.reject(new Error('not called')) });

function served(): string[] {
  const app = createApp({
    verifier: { verify: async () => null },
    repository: memoryRepository(EMPTY),
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    releases: unused as ReleaseRepository,
    settings: memorySiteSettings(),
    unpublished: unused as UnpublishedRepository,
    usageStats: unused as UsageStatsSource,
    deepHealth: deepHealth({}),
  });
  // Each handler of a route (its middlewares too) is an entry; `ALL` are the app's middlewares.
  return [
    ...new Set(app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`)),
  ].sort();
}

const declared = () =>
  Object.values(API_ROUTES)
    .map((r) => `${r.method} ${API_PREFIX}${r.pattern}`)
    .sort();

describe('the API serves API_ROUTES', () => {
  it('every declared route, and no other', () => {
    expect(served()).toEqual(declared());
  });

  it('no route is declared twice', () => {
    expect(new Set(declared()).size).toBe(Object.keys(API_ROUTES).length);
  });
});
