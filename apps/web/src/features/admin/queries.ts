import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import type { NewCardReport, ReportStatus } from './repository';

const REPORTS = ['card-reports'] as const;

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

export function useCardReports(enabled: boolean) {
  const { admin } = useServices();
  return useQuery({ queryKey: REPORTS, queryFn: () => admin.listReports(), enabled });
}

export function useReportCard() {
  const { admin } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (report: NewCardReport) => admin.reportCard(report),
    onSuccess: () => client.invalidateQueries({ queryKey: REPORTS }),
  });
}

export function useSetReportStatus() {
  const { admin } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReportStatus }) =>
      admin.setReportStatus(id, status),
    onSuccess: () => client.invalidateQueries({ queryKey: REPORTS }),
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
