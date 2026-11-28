// Who the accounts of «Errores» are, from the users database; if they cannot come, each one goes by the start of its
// id. `known` says the first answer (or failure) is in: until then the list waits, so its names do not change in view.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
    // A database without the function answers at once with the ids, not after the retries.
    retry: false,
    // Another period keeps the names it has while the new ones come.
    placeholderData: keepPreviousData,
  });
  return {
    labels: labels.data ?? [],
    known: sorted.length === 0 || labels.data !== undefined || labels.isError,
  };
}
