// Tests the cache the admin mode shares with the student's: only the user's own and the administration panel's.
import { afterEach, describe, expect, it } from 'vitest';
import { sharedWithAdminMode } from '../adminMode';
import { adminKeys } from '../../admin/api/queries';
import { releaseKeys } from '../../admin/api/releases';
import { reportKeys } from '../../reports/api/queries';
import { studyKeys } from '../../progress/queries';

afterEach(() => window.localStorage.clear());

describe('the admin mode', () => {
  it('the cache it shares with the site is the user’s, their preferences and the administration panel’s, by their own keys', () => {
    for (const key of [
      adminKeys.isAdmin,
      adminKeys.access,
      adminKeys.unpublished,
      releaseKeys.overview,
      releaseKeys.texts('fp'),
      reportKeys.queue,
      reportKeys.mine,
      studyKeys.preferences,
    ]) {
      expect(sharedWithAdminMode(key)).toBe(true);
    }
    for (const key of [
      adminKeys.siteSettings,
      adminKeys.usage,
      adminKeys.catalog,
      studyKeys.plan,
      studyKeys.cards('20'),
    ]) {
      expect(sharedWithAdminMode(key)).toBe(false);
    }
  });
});
