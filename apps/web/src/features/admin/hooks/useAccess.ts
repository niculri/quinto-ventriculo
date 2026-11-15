// «Acceso»: who is invited, and inviting, removing and naming administrators; each change reads the report again.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminRepository } from '../api/context';
import { accessQuery, adminKeys } from '../api/queries';
import type { RemoveResult, SetAdminResult } from '../api/repository';

export function useAccessReport() {
  const admin = useAdminRepository();
  return useQuery(accessQuery(admin));
}

export function useInvite() {
  const admin = useAdminRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { emails: string[]; list: string; note: string | null }) =>
      admin.invite(input),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.access }),
  });
}

export function useRemoveInvites() {
  const admin = useAdminRepository();
  const client = useQueryClient();
  return useMutation<RemoveResult, Error, { emails: string[] } | { list: string }>({
    mutationFn: (target) => admin.removeInvites(target),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.access }),
  });
}

export function useSetAdmin() {
  const admin = useAdminRepository();
  const client = useQueryClient();
  return useMutation<SetAdminResult, Error, { email: string; admin: boolean }>({
    mutationFn: (input) => admin.setAdmin(input),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.access }),
  });
}
