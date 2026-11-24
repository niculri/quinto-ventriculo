// QueriesWrapper: a piece drawn alone, with the query client and the content API that the site's providers give it.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientContext } from '../shared/hooks/useApi';
import { fakeApi } from './fakes/api';

export function QueriesWrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const [api] = useState(fakeApi);
  return (
    <QueryClientProvider client={client}>
      <ApiClientContext value={api}>{children}</ApiClientContext>
    </QueryClientProvider>
  );
}
