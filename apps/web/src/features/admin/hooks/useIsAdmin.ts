// Whether whoever looks is an administrator: it only shows or hides the panel and its menu entries.
import { useQuery } from '@tanstack/react-query';
import { useAdminRepository } from '../api/context';
import { isAdminQuery } from '../api/queries';

export function useIsAdmin() {
  const admin = useAdminRepository();
  return useQuery(isAdminQuery(admin));
}
