// Switches the whole site to the admin mode for an administrator: services and a cache of its own, and back.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Services } from './services';
import { localQuizRepository } from '../features/quiz/api/repository';
import { studyKeys } from '../features/progress/queries';
import {
  AdminModeContext,
  sharedWithAdminMode,
  adminStudyRepository,
  storeAdminMode,
  storedAdminMode,
} from '../features/adminMode/adminMode';
import type { AdminMode } from '../features/adminMode/adminMode';

const fresh = (services: Services): Pick<Services, 'study' | 'quiz'> => ({
  study: adminStudyRepository(services.study),
  quiz: localQuizRepository(null),
});

export interface AdminModeParts {
  services: Services;
  client: QueryClient;
  /** A key for what is under the switch: a query keeps the QueryClient it was mounted with. */
  site: 'student' | 'admin';
}

export function AdminModeSwitch({
  services,
  client,
  adminClient,
  render,
}: {
  services: Services;
  client: QueryClient;
  adminClient: QueryClient;
  render: (parts: AdminModeParts) => ReactNode;
}) {
  const available = !!services.adminApi;
  const [repos, setRepos] = useState<Pick<Services, 'study' | 'quiz'> | null>(() =>
    available && storedAdminMode() ? fresh(services) : null,
  );

  const adminServices = useMemo<Services | null>(
    () =>
      repos && services.adminApi
        ? {
            ...services,
            ...repos,
            api: services.adminApi,
            reports: { ...services.reports, send: async () => {} },
          }
        : null,
    [repos, services],
  );

  const enter = useCallback(() => {
    if (!available) return;
    adminClient.clear();
    for (const q of client
      .getQueryCache()
      .findAll({ predicate: (q) => sharedWithAdminMode(q.queryKey) })) {
      if (q.state.data !== undefined) adminClient.setQueryData(q.queryKey, q.state.data);
    }
    storeAdminMode(true);
    setRepos(fresh(services));
  }, [available, client, adminClient, services]);

  const exit = useCallback(() => {
    // Back to the site's cache before it is mounted again, so the page does not leave the screen while it is read again;
    // the preferences are read again, since the admin mode may have changed them in memory only.
    for (const q of adminClient
      .getQueryCache()
      .findAll({ predicate: (q) => sharedWithAdminMode(q.queryKey) })) {
      if (q.state.data === undefined) continue;
      if (q.queryKey[0] === 'release' || client.getQueryData(q.queryKey) === undefined) {
        client.setQueryData(q.queryKey, q.state.data);
      }
    }
    void client.invalidateQueries({ queryKey: studyKeys.preferences });
    storeAdminMode(false);
    setRepos(null);
    adminClient.clear();
  }, [client, adminClient]);

  // What this browser remembers is not about whoever signs in: somebody who is not an administrator leaves the mode,
  // or would study without anything saved. Signed out, the mode is only remembered.
  const active = !!repos;
  useEffect(() => {
    if (!active) return;
    let gone = false;
    const check = () => {
      void services.session.current().then((session) => {
        if (!session || gone) return;
        services.admin.isAdmin().then(
          (yes) => {
            if (!yes && !gone) exit();
          },
          // A failure is not a «no»: the API gives anybody who is not one what a student gets anyway.
          () => undefined,
        );
      });
    };
    check();
    const off = services.session.subscribe((s) => {
      if (s && !gone) check();
    });
    return () => {
      gone = true;
      off();
    };
  }, [active, services, exit]);

  const value: AdminMode = {
    active: !!adminServices,
    available,
    set: (on) => (on ? enter() : exit()),
  };
  return (
    <AdminModeContext value={value}>
      {render(
        adminServices
          ? { services: adminServices, client: adminClient, site: 'admin' }
          : { services, client, site: 'student' },
      )}
    </AdminModeContext>
  );
}
