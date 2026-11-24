// The providers around the whole site: services, React Query and the session, with the admin mode.
import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { RefreshContentContext } from '../shared/hooks/useRefreshContent';
import { forgetKeptAnswers } from '../shared/lib/api';
import { isContentQuery } from '../shared/lib/contentQuery';
import { AdminModeSwitch } from './AdminModeSwitch';
import { SessionProvider } from './SessionProvider';
import { createQueryClient } from './queryClient';
import { ServicesProvider } from './ServicesProvider';
import type { Services } from './ServicesProvider';

export function Providers({
  services,
  children,
  queryClient,
}: {
  services: Services;
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  const [adminClient] = useState(() => createQueryClient());
  // Also the cache not in use: leaving the admin mode after publishing must not bring back what was there before.
  const refreshContent = () => {
    forgetKeptAnswers(services.api);
    for (const c of [client, adminClient]) void c.invalidateQueries({ predicate: isContentQuery });
  };
  return (
    <RefreshContentContext value={refreshContent}>
      <AdminModeSwitch
        services={services}
        client={client}
        adminClient={adminClient}
        render={(parts) => (
          <ServicesProvider services={parts.services}>
            <QueryClientProvider client={parts.client}>
              {/* The session stays; the site is mounted again on entering or leaving the admin mode (its queries follow
                the QueryClient they were mounted with). */}
              <SessionProvider>
                <Fragment key={parts.site}>{children}</Fragment>
              </SessionProvider>
            </QueryClientProvider>
          </ServicesProvider>
        )}
      />
    </RefreshContentContext>
  );
}
