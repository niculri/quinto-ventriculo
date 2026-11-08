import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Services } from '../../app/services';
import { localQuizRepository } from '../quiz/repository';
import { localStudyRepository } from '../study/repository';
import type { StudyRepository } from '../study/repository';
import { studyKeys } from '../study/queries';

/**
 * The preview of the draft (step 1.7, part 2): the whole site with the draft, only for an administrator. It is entered
 * and left from «Opciones» → «Publicaciones». While it lasts:
 *   - the API is asked with `X-QV-Preview: draft` (the API checks `is_admin()`; anybody else gets what is published),
 *     with the browser's cache off;
 *   - the web keeps its data in a cache of its own (another QueryClient), emptied when leaving, so nothing of the
 *     draft stays in the published site and nothing of the published site is shown as the draft;
 *   - studying and answering a test write nothing in the users' database: the demo mode's repositories, in memory,
 *     starting from what the administrator chose (`previewStudyRepository`), and thrown away when leaving. «Reportar error» writes nothing either. The cards' changes of the draft never reach
 *     `reconcile_cards()` (the cursor of the published site would move).
 * It lasts while the tab is open (sessionStorage): a reload stays in it; another tab does not start in it. Only an
 * administrator stays in it: signing out leaves it, and so does a tab whose user is not one (another person who signs
 * in there, or someone who stopped being one), whose study would otherwise be kept only in memory.
 */
const KEY = 'qv-preview';

export interface Preview {
  active: boolean;
  /** This build can preview (it has the API client with the header). */
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
    // blocked storage: it lasts until the page is reloaded
  }
};

/**
 * What of the site's cache is the same in the preview (who the user is, their preferences, the administration panel's:
 * the releases, the reports, who is invited and what was taken off the site, step 2.10).
 */
const SHARED = (key: readonly unknown[]) =>
  key[0] === 'is-admin' ||
  key[0] === 'release' ||
  key[0] === 'card-reports' ||
  key[0] === 'access-report' ||
  key[0] === 'unpublished-log' ||
  (key[0] === studyKeys.preferences[0] && key[1] === studyKeys.preferences[1]);

/**
 * The demo mode's study repository, in memory, starting with what the user chose in the real one (their preferences,
 * the weeks or lectures they turned on and their assessments' settings), so «Opciones» and the decks look the same.
 * The real one is only read (never through the card sync, which would write the published site's changes), once,
 * before the first use; everything after stays in memory.
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

/** A preview's repositories: in memory, thrown away when it ends. */
const fresh = (services: Services): Pick<Services, 'study' | 'quiz'> => ({
  study: previewStudyRepository(services.study),
  quiz: localQuizRepository(null),
});

export interface PreviewParts {
  services: Services;
  client: QueryClient;
  /**
   * Which site it is: what is under the switch has to be mounted again when it changes (Revisión de cero (1.7, parte
   * 2)). A query keeps the QueryClient it was mounted with: without this, the menu and whatever stayed on the screen
   * went on reading the published site in the preview (and the preview's cache after leaving it).
   */
  site: 'published' | 'preview';
}

/**
 * Decides which services and which cache the site uses: the published ones, or the preview's. `render` gets them
 * (Providers puts them around the app).
 */
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
  // A preview's own repositories, made when it starts (from the user's preferences of now) and thrown away when it
  // ends: a new preview starts from nothing.
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
            admin: { ...services.admin, reportCard: async () => {} },
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
    // Revisión de cero (1.7, parte 2): what is the same in both goes back to the site's cache before the site is mounted
    // again (else the page leaves the screen while it is read again): the panel's (its marks may have changed in the
    // preview), and who the user is or their preferences if the site did not have them yet. The preferences are read
    // again: the preview's may have been changed in memory only.
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
    // Nothing of the draft stays: its cache and its repositories go.
    previewClient.clear();
  }, [client, previewClient]);

  // Revisión de cero (1.7, parte 2): only for an administrator. Without this, the next person who signed in in this
  // tab (the flag survives Google's redirect) would study without anything being saved.
  const active = !!repos;
  useEffect(() => {
    if (!active) return;
    let gone = false;
    const check = () => {
      services.admin.isAdmin().then(
        (yes) => {
          if (!yes && !gone) exit();
        },
        // A failure (no network) is not a «no»: the API gives anybody who is not one what is published anyway.
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
