// Tests the cache the admin mode shares with the student's: only the user's own and the administration panel's.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharedWithAdminMode, storeAdminMode, storedAdminMode, useAdminMode } from '../adminMode';
import { adminKeys } from '../../admin/api/queries';
import { releaseKeys } from '../../admin/api/releases';
import { reportKeys } from '../../reports/api/queries';
import { studyKeys } from '../../progress/queries';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

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

describe('the mode the browser remembers', () => {
  it('the first time it is the student’s; then the last one used', () => {
    expect(storedAdminMode()).toBe(false);
    storeAdminMode(true);
    expect(storedAdminMode()).toBe(true);
    storeAdminMode(false);
    expect(storedAdminMode()).toBe(false);
  });

  it('a blocked storage is the student’s mode, and switching does not fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => storeAdminMode(true)).not.toThrow();
    expect(storedAdminMode()).toBe(false);
  });

  it('outside the switch there is no admin mode, and asking for it does nothing', () => {
    const { result } = renderHook(() => useAdminMode());
    expect(result.current).toMatchObject({ active: false, available: false });
    result.current.set(true);
    expect(renderHook(() => useAdminMode()).result.current.active).toBe(false);
  });
});
