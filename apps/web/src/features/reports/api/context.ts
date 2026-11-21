// The error reports repository: app/services.tsx provides it; the tests and the admin preview swap it.
import { createContext, use } from 'react';
import type { ReportsRepository } from './repository';

export const ReportsRepositoryContext = createContext<ReportsRepository | null>(null);

export function useReportsRepository(): ReportsRepository {
  const reports = use(ReportsRepositoryContext);
  if (reports === null) throw new Error('useReportsRepository outside <ServicesProvider>');
  return reports;
}
