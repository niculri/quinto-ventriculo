// «Sitio»'s setting, read and changed; after a change the catalog is fetched fresh, so this tab shows it at once.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { adminKeys, siteSettingsQuery } from '../api/queries';

export function useSiteSettings(enabled: boolean) {
  const api = useApi();
  return useQuery(siteSettingsQuery(api, enabled));
}

export function useSetSiteSettings() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { hideEmptySemesters: boolean }) => api.setSiteSettings(body),
    onSuccess: async (saved) => {
      client.setQueryData(adminKeys.siteSettings, saved);
      // A catalog that does not come now is not a failure to save: this tab sees the change when it comes again.
      await client
        .fetchQuery({
          queryKey: adminKeys.catalog,
          queryFn: ({ signal }) => api.catalog(signal, { fresh: true }),
          staleTime: 0,
        })
        .catch(() => undefined);
    },
  });
}
