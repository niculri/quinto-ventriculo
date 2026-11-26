// «Anuncios»: the list, writing one about the site or saving again the one of a publication, and withdrawing one;
// after each, the list is read again.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaveAnnouncementRequest } from '@qv/schema';
import { useApi } from '../../../shared/hooks/useApi';
import {
  announcementKeys,
  announcementsQuery,
  failedAnnouncementQuery,
} from '../api/announcements';

export function useAnnouncements() {
  const api = useApi();
  return useQuery(announcementsQuery(api));
}

export function useFailedAnnouncement() {
  return useQuery(failedAnnouncementQuery()).data ?? null;
}

export function useSaveAnnouncement() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveAnnouncementRequest) => api.saveAnnouncement(body),
    onSuccess: (saved) => {
      if (saved.releaseId !== null) client.setQueryData(announcementKeys.failed, null);
    },
    onSettled: () => client.invalidateQueries({ queryKey: announcementKeys.list, exact: true }),
  });
}

export function useWithdrawAnnouncement() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.withdrawAnnouncement(id),
    onSettled: () => client.invalidateQueries({ queryKey: announcementKeys.list, exact: true }),
  });
}
