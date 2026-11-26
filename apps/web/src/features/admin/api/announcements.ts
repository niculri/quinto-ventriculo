// What «Anuncios» reads, with its keys: every announcement, and the one of a publication that could not be saved.
import { queryOptions } from '@tanstack/react-query';
import type { AnnouncementDraft } from '@qv/schema';
import type { ApiClient } from '../../../shared/lib/api';

export const announcementKeys = {
  list: ['announcements'] as const,
  /** Kept only in this tab, until it is saved again or closed. */
  failed: ['announcements', 'failed'] as const,
};

export interface FailedAnnouncement {
  releaseId: number;
  draft: AnnouncementDraft;
}

export const announcementsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: announcementKeys.list,
    queryFn: ({ signal }) => api.announcements(signal),
    staleTime: 30_000,
  });

export const failedAnnouncementQuery = () =>
  queryOptions({
    queryKey: announcementKeys.failed,
    queryFn: () => null as FailedAnnouncement | null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
