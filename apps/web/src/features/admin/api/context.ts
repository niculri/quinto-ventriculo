// The administration repository (administrators and invitations): app/services.tsx provides it; the tests swap it.
import { createContext, use } from 'react';
import type { AdminRepository } from './repository';

export const AdminRepositoryContext = createContext<AdminRepository | null>(null);

export function useAdminRepository(): AdminRepository {
  const admin = use(AdminRepositoryContext);
  if (admin === null) throw new Error('useAdminRepository outside <ServicesProvider>');
  return admin;
}
