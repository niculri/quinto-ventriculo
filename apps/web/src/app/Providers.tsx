import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiRequestError } from '../lib/api';
import { PreviewSwitch } from '../features/preview/preview';
import { SessionProvider } from '../features/session/context';
import { ServicesProvider } from './services';
import type { Services } from './services';

export function createQueryClient() {
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
  // The preview of the draft has a cache of its own (features/preview/preview.tsx).
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
