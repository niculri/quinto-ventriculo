// The providers around the whole site: services, React Query and the session, with the admin preview of the draft.
import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { AdminModeSwitch } from './AdminModeSwitch';
import { SessionProvider } from './SessionProvider';
import { createQueryClient } from './queryClient';
import { ServicesProvider } from './services';
import type { Services } from './services';

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
  return (
    <AdminModeSwitch
      services={services}
      client={client}
      adminClient={adminClient}
      render={(parts) => (
        <ServicesProvider services={parts.services}>
          <QueryClientProvider client={parts.client}>
            {/* The session stays; the site is mounted again on entering or leaving the preview (its queries follow
                the QueryClient they were mounted with). */}
            <SessionProvider>
              <Fragment key={parts.site}>{children}</Fragment>
            </SessionProvider>
          </QueryClientProvider>
        </ServicesProvider>
      )}
    />
  );
}
