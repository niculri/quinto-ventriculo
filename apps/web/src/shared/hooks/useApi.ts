// The content API client: app/services.tsx provides it; the tests and the admin mode swap it.
import { createContext, use } from 'react';
import type { ApiClient } from '../lib/api';

export const ApiClientContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = use(ApiClientContext);
  if (api === null) throw new Error('useApi outside <ServicesProvider>');
  return api;
}
