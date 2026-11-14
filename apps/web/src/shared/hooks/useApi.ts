// The content API client: app/services.tsx provides it; the tests and the admin preview swap it.
import { createContext, useContext } from 'react';
import type { ApiClient } from '../lib/api';

export const ApiClientContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = useContext(ApiClientContext);
  if (api === null) throw new Error('useApi outside <ServicesProvider>');
  return api;
}
