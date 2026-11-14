// Switches the whole site to the draft for an administrator: services and a cache of its own, and back.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Services } from './services';
import { localQuizRepository } from '../features/quiz/api/repository';
import { studyKeys } from '../features/study/queries';
import {
  Context,
  SHARED,
  previewStudyRepository,
  store,
  stored,
} from '../features/preview/preview';
import type { Preview } from '../features/preview/preview';

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
