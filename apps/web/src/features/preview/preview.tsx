// The preview of the draft for an administrator: the whole site with the draft, with services and a cache of its own.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Services } from '../../app/services';
import { localQuizRepository } from '../quiz/repository';
import { localStudyRepository } from '../study/repository';
import type { StudyRepository } from '../study/repository';
import { studyKeys } from '../study/queries';

/** In sessionStorage: a reload stays in the preview; another tab does not start in it. */
const KEY = 'qv-preview';

export interface Preview {
  active: boolean;
  available: boolean;
  enter(): void;
  exit(): void;
}

const Context = createContext<Preview>({
  active: false,
  available: false,
  enter() {},
  exit() {},
});

export const usePreview = () => useContext(Context);

const stored = () => {
  try {
    return window.sessionStorage.getItem(KEY) === 'draft';
  } catch {
    return false;
  }
};
const store = (on: boolean) => {
  try {
    if (on) window.sessionStorage.setItem(KEY, 'draft');
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // blocked storage: it lasts until a reload
  }
};

/** The cache entries that are the same in the preview: the user, their preferences and the administration panel's. */
const SHARED = (key: readonly unknown[]) =>
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

const fresh = (services: Services): Pick<Services, 'study' | 'quiz'> => ({
  study: previewStudyRepository(services.study),
  quiz: localQuizRepository(null),
});

export interface PreviewParts {
  services: Services;
  client: QueryClient;
  /** A key for what is under the switch: a query keeps the QueryClient it was mounted with. */
  site: 'published' | 'preview';
}

export function PreviewSwitch({
  services,
  client,
  previewClient,
  render,
}: {
  services: Services;
  client: QueryClient;
  previewClient: QueryClient;
  render: (parts: PreviewParts) => ReactNode;
}) {
  const available = !!services.previewApi;
  const [repos, setRepos] = useState<Pick<Services, 'study' | 'quiz'> | null>(() =>
    available && stored() ? fresh(services) : null,
  );

  const previewServices = useMemo<Services | null>(
    () =>
      repos && services.previewApi
        ? {
            ...services,
            ...repos,
            api: services.previewApi,
            reports: { ...services.reports, send: async () => {} },
          }
        : null,
    [repos, services],
  );

  const enter = useCallback(() => {
    if (!available) return;
    previewClient.clear();
    for (const q of client.getQueryCache().findAll({ predicate: (q) => SHARED(q.queryKey) })) {
      if (q.state.data !== undefined) previewClient.setQueryData(q.queryKey, q.state.data);
    }
    store(true);
    setRepos(fresh(services));
  }, [available, client, previewClient, services]);

  const exit = useCallback(() => {
    // Back to the site's cache before it is mounted again, so the page does not leave the screen while it is read again;
    // the preferences are read again, since the preview may have changed them in memory only.
    for (const q of previewClient
      .getQueryCache()
      .findAll({ predicate: (q) => SHARED(q.queryKey) })) {
      if (q.state.data === undefined) continue;
      if (q.queryKey[0] === 'release' || client.getQueryData(q.queryKey) === undefined) {
        client.setQueryData(q.queryKey, q.state.data);
      }
    }
    void client.invalidateQueries({ queryKey: studyKeys.preferences });
    store(false);
    setRepos(null);
    previewClient.clear();
  }, [client, previewClient]);

  // The flag survives Google's redirect: without this, the next person who signs in here would study without saving.
  const active = !!repos;
  useEffect(() => {
    if (!active) return;
    let gone = false;
    const check = () => {
      services.admin.isAdmin().then(
        (yes) => {
          if (!yes && !gone) exit();
        },
        // A failure is not a «no»: the API gives anybody who is not one what is published anyway.
        () => undefined,
      );
    };
    check();
    const off = services.session.subscribe((s) => {
      if (gone) return;
      if (!s) exit();
      else check();
    });
    return () => {
      gone = true;
      off();
    };
  }, [active, services, exit]);

  const value = useMemo<Preview>(
    () => ({ active: !!previewServices, available, enter, exit }),
    [previewServices, available, enter, exit],
  );
  return (
    <Context value={value}>
      {render(
        previewServices
          ? { services: previewServices, client: previewClient, site: 'preview' }
          : { services, client, site: 'published' },
      )}
    </Context>
  );
}
