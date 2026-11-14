// The administration panel's queries and changes: admin role, site settings, access, usage and the unpublished log.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import type { RemoveResult, SetAdminResult } from './repository';

/** Only shows or hides the panel: the database enforces who is an administrator. */
export function useIsAdmin() {
  const { admin } = useServices();
  return useQuery({
    queryKey: ['is-admin'],
    queryFn: () => admin.isAdmin(),
    staleTime: 10 * 60_000,
    // A failure here only hides the panel: it must not bother anybody.
    retry: false,
  });
}

const SITE_SETTINGS = ['site-settings'] as const;

export function useSiteSettings(enabled: boolean) {
  const { api } = useServices();
  return useQuery({
    queryKey: SITE_SETTINGS,
    queryFn: ({ signal }) => api.siteSettings(signal),
    enabled,
  });
}

/** Then the catalog is fetched fresh, not from the browser's copy, so the change shows at once on this tab. */
export function useSetSiteSettings() {
  const { api } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { hideEmptySemesters: boolean }) => api.setSiteSettings(body),
    onSuccess: async (saved) => {
      client.setQueryData(SITE_SETTINGS, saved);
      // A catalog that does not come now is not a failure to save: this tab sees the change when it comes again.
      await client
        .fetchQuery({
          queryKey: ['catalog'],
          queryFn: ({ signal }) => api.catalog(signal, { fresh: true }),
          staleTime: 0,
        })
        .catch(() => undefined);
    },
  });
}

const ACCESS = ['access-report'] as const;

export function useAccessReport() {
  const { admin } = useServices();
  return useQuery({ queryKey: ACCESS, queryFn: () => admin.accessReport() });
}

export function useInvite() {
  const { admin } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { emails: string[]; list: string; note: string | null }) =>
      admin.invite(input),
    onSettled: () => client.invalidateQueries({ queryKey: ACCESS }),
  });
}

export function useRemoveInvites() {
  const { admin } = useServices();
  const client = useQueryClient();
  return useMutation<RemoveResult, Error, { emails: string[] } | { list: string }>({
    mutationFn: (target) => admin.removeInvites(target),
    onSettled: () => client.invalidateQueries({ queryKey: ACCESS }),
  });
}

export function useSetAdmin() {
  const { admin } = useServices();
  const client = useQueryClient();
  return useMutation<SetAdminResult, Error, { email: string; admin: boolean }>({
    mutationFn: (input) => admin.setAdmin(input),
    onSettled: () => client.invalidateQueries({ queryKey: ACCESS }),
  });
}

export function useUsageReport() {
  const { api } = useServices();
  return useQuery({
    queryKey: ['usage-report'],
    queryFn: ({ signal }) => api.usage(signal),
    staleTime: 60_000,
  });
}

export function useUnpublishedLog() {
  const { api } = useServices();
  return useQuery({
    queryKey: ['unpublished-log'],
    queryFn: ({ signal }) => api.unpublishedLog(signal),
  });
}
