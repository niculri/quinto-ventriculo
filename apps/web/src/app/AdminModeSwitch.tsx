// Switches the whole site to the admin mode for an administrator: the content API and a cache of its own, over the
// same progress, and back.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Services } from './ServicesProvider';
import type { ApiClient } from '../shared/lib/api';
import { quizKeys } from '../features/quiz/api/queries';
import { studyKeys } from '../features/progress/queries';
import {
  AdminModeContext,
  sharedWithAdminMode,
  storeAdminMode,
  storedAdminMode,
} from '../features/adminMode/adminMode';
import type { AdminMode } from '../features/adminMode/adminMode';
import { draftOnly } from '../features/adminMode/draftOnly';
import { guardQuiz, guardReports, guardStudy } from '../features/adminMode/draftGuard';

/** The same repositories, with a net under them for what only the draft has. */
const guarded = (
  services: Services,
  adminApi: ApiClient,
): Pick<Services, 'study' | 'quiz' | 'reports'> => {
  const draft = draftOnly(adminApi);
  return {
    study: guardStudy(services.study, draft),
    quiz: guardQuiz(services.quiz, draft),
    reports: guardReports(services.reports, draft),
  };
};

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
  const [repos, setRepos] = useState<Pick<Services, 'study' | 'quiz' | 'reports'> | null>(() =>
    services.adminApi && storedAdminMode() ? guarded(services, services.adminApi) : null,
  );

  // `render` is called with it: the compiler would leave it new in each render, and the whole site would read it again.
  const adminServices = useMemo<Services | null>(
    () => (repos && services.adminApi ? { ...services, ...repos, api: services.adminApi } : null),
    [repos, services],
  );

  const enter = () => {
    if (!services.adminApi) return;
    adminClient.clear();
    for (const q of client
      .getQueryCache()
      .findAll({ predicate: (q) => sharedWithAdminMode(q.queryKey) })) {
      if (q.state.data !== undefined) adminClient.setQueryData(q.queryKey, q.state.data);
    }
    storeAdminMode(true);
    setRepos(guarded(services, services.adminApi));
  };

  // An effect depends on it: a new one in each render would check the session again each time.
  const exit = useCallback(() => {
    // Back to the site's cache before it is mounted again, so the page does not leave the screen while it is read again;
    // the progress is read again, since it was studied in the other cache.
    for (const q of adminClient
      .getQueryCache()
      .findAll({ predicate: (q) => sharedWithAdminMode(q.queryKey) })) {
      if (q.state.data === undefined) continue;
      if (q.queryKey[0] === 'release' || client.getQueryData(q.queryKey) === undefined) {
        client.setQueryData(q.queryKey, q.state.data);
      }
    }
    void client.invalidateQueries({ queryKey: studyKeys.all });
    void client.invalidateQueries({ queryKey: quizKeys.savedAll });
    storeAdminMode(false);
    setRepos(null);
    adminClient.clear();
  }, [client, adminClient]);

  useLeaveIfNotAdmin(!!repos, services, exit);

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

/**
 * What this browser remembers is not about whoever signs in: somebody who is not an administrator leaves the mode, or
 * would study without anything saved. Signed out, the mode is only remembered.
 */
function useLeaveIfNotAdmin(active: boolean, services: Services, exit: () => void) {
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
}
