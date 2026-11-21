// The admin mode for an administrator: whether it is on, how the browser remembers it, what it shares with the site's
// cache and the study repository it uses (app/AdminModeSwitch.tsx switches the site).
import { createContext, use } from 'react';
import { localStudyRepository } from '../progress/api/repository';
import type { StudyRepository } from '../progress/api/repository';
import { studyKeys } from '../progress/queries';
import { storageKeys } from '../../shared/lib/storage';

/** The last mode this browser used, in localStorage: the first time, and for anybody else, it is the student's. */
const KEY = storageKeys.adminMode;

export interface AdminMode {
  /** The draft and what is off for the students, and nothing is saved. */
  active: boolean;
  /** The site can offer it: it has the API client for it. Only an administrator is given it by the API. */
  available: boolean;
  set: (active: boolean) => void;
}

export const AdminModeContext = createContext<AdminMode>({
  active: false,
  available: false,
  set: () => undefined,
});

export const useAdminMode = () => use(AdminModeContext);

export const storedAdminMode = () => {
  try {
    return window.localStorage.getItem(KEY) === 'admin';
  } catch {
    return false;
  }
};
/** This browser has already had the mode chosen: somebody here is, or was, an administrator. */
export const hasStoredAdminMode = () => {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
};
export const storeAdminMode = (on: boolean) => {
  try {
    window.localStorage.setItem(KEY, on ? 'admin' : 'student');
  } catch {
    // blocked storage: it lasts until a reload
  }
};

/**
 * The cache entries that are the same in the admin mode: the user, their preferences and the administration panel's (their
 * first elements are the admin and reports keys', written here so the startup does not load those pages' reads).
 */
export const sharedWithAdminMode = (key: readonly unknown[]) =>
  key[0] === 'is-admin' ||
  key[0] === 'release' ||
  key[0] === 'report-queue' ||
  key[0] === 'my-reports' ||
  key[0] === 'access-report' ||
  key[0] === 'unpublished-log' ||
  (key[0] === studyKeys.preferences[0] && key[1] === studyKeys.preferences[1]);

/**
 * In memory, seeded once from the real one's preferences, activations and settings; the real one is never synced, which
 * would write the published site's card changes.
 */
export function adminStudyRepository(real: StudyRepository): StudyRepository {
  const local = localStudyRepository(null);
  let ready: Promise<void> | null = null;
  const seed = () =>
    (ready ??= (async () => {
      const [prefs, activations, settings] = await Promise.all([
        real.preferences(),
        real.deckActivations(),
        real.assessmentSettings(),
      ]).catch(() => [null, [], []] as const);
      if (prefs) await local.savePreferences(prefs);
      for (const a of activations) await local.setDeckActivation(a.deckId, a.active);
      for (const s of settings) await local.saveAssessmentSetting(s);
    })());
  return new Proxy(local, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        await seed();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
