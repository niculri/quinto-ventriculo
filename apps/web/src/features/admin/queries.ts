import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import type { RemoveResult, SetAdminResult } from './repository';

/** Whether the signed-in user is an administrator (the database enforces it; this only shows the panel). */
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

/** How the site is shown (step 1.8): the administrator's switch. */
export function useSiteSettings(enabled: boolean) {
  const { api } = useServices();
  return useQuery({
    queryKey: SITE_SETTINGS,
    queryFn: ({ signal }) => api.siteSettings(signal),
    enabled,
  });
}

/**
 * Changes the settings; then the catalog is asked for again, not taken from the browser's copy, so that the change
 * shows at once on this tab (everybody else's within a minute, or on reloading).
 */
export function useSetSiteSettings() {
  const { api } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { hideEmptySemesters: boolean }) => api.setSiteSettings(body),
    onSuccess: async (saved) => {
      client.setQueryData(SITE_SETTINGS, saved);
      // Revisión de cero (1.8): a catalog that does not come now is not a failure to save (the panel said «No se pudo
      // guardar» with the switch already changed); this tab sees it when the catalog comes again.
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

/**
 * «Acceso» (step 2.10): who is invited, by list, and the accounts without an invitation. Straight to the users'
 * database, with the administrator's own token (it checks is_admin() and the open session).
 */
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

/** Step 2.10 b: the owner names or removes an administrator. */
export function useSetAdmin() {
  const { admin } = useServices();
  const client = useQueryClient();
  return useMutation<SetAdminResult, Error, { email: string; admin: boolean }>({
    mutationFn: (input) => admin.setAdmin(input),
    onSettled: () => client.invalidateQueries({ queryKey: ACCESS }),
  });
}

/** «Fuera del sitio» (step 2.10): the record of what was taken off the site, only to look at. */
export function useUnpublishedLog() {
  const { api } = useServices();
  return useQuery({
    queryKey: ['unpublished-log'],
    queryFn: ({ signal }) => api.unpublishedLog(signal),
  });
}
