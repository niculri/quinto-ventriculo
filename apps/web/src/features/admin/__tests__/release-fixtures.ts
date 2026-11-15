// The draft that «Publicaciones» and its preview are tested with: what the database gives for the e2e folder.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReleaseSummary } from '@qv/schema';
import type { ReleaseOverview } from '@qv/schema';
import { fakeApi } from '../../../test/render';

/** What the database gives for the e2e folder's draft (db/tests/release.test.ts writes it). */
export const SUMMARY = ReleaseSummary.parse(
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../../e2e/content/release/summary.json'), 'utf8'),
  ),
);
export const OVERVIEW: ReleaseOverview = {
  supportedSchemaVersion: 1,
  summary: SUMMARY,
  browseIndexes: [],
};

export const adminApi = (changes: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({
    releaseOverview: async () => OVERVIEW,
    releaseTexts: async () => ({ items: [], next: null }),
    releaseMedia: async () => ({ checked: [], missing: [], next: null }),
    releaseLog: async () => ({ releases: [] }),
    ...changes,
  });
