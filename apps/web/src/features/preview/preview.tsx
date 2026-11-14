// The preview of the draft for an administrator: whether it is on, how a tab remembers it, what it shares with the
// site's cache and the study repository it uses (app/PreviewSwitch.tsx switches the site).
import { createContext, useContext } from 'react';
import { localStudyRepository } from '../progress/api/repository';
import type { StudyRepository } from '../progress/api/repository';
import { studyKeys } from '../progress/queries';

/** In sessionStorage: a reload stays in the preview; another tab does not start in it. */
const KEY = 'qv-preview';

export interface Preview {
  active: boolean;
  available: boolean;
  enter(): void;
  exit(): void;
}

export const Context = createContext<Preview>({
  active: false,
  available: false,
  enter() {},
  exit() {},
});

export const usePreview = () => useContext(Context);

export const stored = () => {
  try {
    return window.sessionStorage.getItem(KEY) === 'draft';
  } catch {
    return false;
  }
};
export const store = (on: boolean) => {
  try {
    if (on) window.sessionStorage.setItem(KEY, 'draft');
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // blocked storage: it lasts until a reload
  }
};

/** The cache entries that are the same in the preview: the user, their preferences and the administration panel's. */
export const SHARED = (key: readonly unknown[]) =>
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
export function previewStudyRepository(real: StudyRepository): StudyRepository {
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
