// Who the accounts of «Errores» are, from the users database; while they come, or if they cannot, each one goes by
// the start of its id.
import { useQuery } from '@tanstack/react-query';
import { useAdminRepository } from '../api/context';
import { adminKeys } from '../api/queries';

export function useAccountLabels(ids: readonly string[]) {
  const admin = useAdminRepository();
  const sorted = [...ids].sort();
  const labels = useQuery({
    queryKey: adminKeys.accountLabels(sorted),
    queryFn: () => admin.accountLabels(sorted),
    enabled: sorted.length > 0,
    staleTime: 5 * 60_000,
  });
  return labels.data ?? [];
}
