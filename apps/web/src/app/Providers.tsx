// The providers around the whole site: services, React Query and the session, with the admin preview of the draft.
import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiRequestError } from '../shared/lib/api';
import { PreviewSwitch } from './PreviewSwitch';
import { SessionProvider } from './SessionProvider';
import { ServicesProvider } from './services';
import type { Services } from './services';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 401, 403 or 404 is not fixed by retrying.
        retry: (attempts, error) =>
          !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) &&
          attempts < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

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
  const [previewClient] = useState(() => createQueryClient());
  return (
    <PreviewSwitch
      services={services}
      client={client}
      previewClient={previewClient}
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
