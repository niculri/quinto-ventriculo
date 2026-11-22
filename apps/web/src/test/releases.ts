// The draft of the e2e folder as the database gives it (db/tests/__tests__/release.flow.test.ts writes it), and an API client that
// answers «Publicaciones» with it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReleaseSummary } from '@qv/schema';
import type { ReleaseOverview } from '@qv/schema';
import { fakeApi } from './fakes/api';

const CONTENT = join(import.meta.dirname, '../../e2e/content/release');

export const RELEASE_SUMMARY = ReleaseSummary.parse(
  JSON.parse(readFileSync(join(CONTENT, 'summary.json'), 'utf8')),
);

/** The changes of each assessment and kind of the draft, by «assessment|kind». */
export const RELEASE_ITEMS = JSON.parse(
  readFileSync(join(CONTENT, 'items.json'), 'utf8'),
) as Record<string, unknown[]>;

export const RELEASE_OVERVIEW: ReleaseOverview = {
  supportedSchemaVersion: 1,
  summary: RELEASE_SUMMARY,
  browseIndexes: [],
};

export const releaseApi = (changes: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({
    releaseOverview: async () => RELEASE_OVERVIEW,
    releaseTexts: async () => ({ items: [], next: null }),
    releaseMedia: async () => ({ checked: [], missing: [], next: null }),
    releaseLog: async () => ({ releases: [] }),
    ...changes,
  });
