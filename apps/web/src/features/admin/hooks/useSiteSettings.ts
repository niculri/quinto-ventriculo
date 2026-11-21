// «Sitio»'s settings, read and changed; after a change the catalog is fetched fresh, so this tab shows it at once.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import type { SiteSettingsUpdate, SiteSettingsView } from '@qv/schema';
import { adminKeys, siteSettingsQuery } from '../api/queries';

export function useSiteSettings(enabled: boolean) {
  const api = useApi();
  return useQuery(siteSettingsQuery(api, enabled));
}

export function useSetSiteSettings() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SiteSettingsUpdate) => api.setSiteSettings(body),
    onSuccess: async (saved) => {
      // The answer has no list of courses: it goes over the settings that are kept, which have it.
      client.setQueryData<SiteSettingsView>(
        adminKeys.siteSettings,
        (old) => old && { ...old, ...saved },
      );
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
