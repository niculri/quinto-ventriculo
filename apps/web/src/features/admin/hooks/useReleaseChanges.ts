// What «Publicaciones» changes: a mark by hand (shown at once), publishing and undoing; then the overview and the
// record are read again, and after publishing or undoing every read of the material.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { releaseTitle, reviewChecks } from '@qv/release-review';
import type { ReviewList } from '@qv/release-review';
import type { AnnouncementDraft, ReleaseMark, ReleaseMarkId, ReleaseOverview } from '@qv/schema';
import { useApi } from '../../../shared/hooks/useApi';
import { useRefreshContent } from '../../../shared/hooks/useRefreshContent';
import { ApiRequestError } from '../../../shared/lib/api';
import { releaseKeys } from '../api/releases';
import { announcementKeys } from '../api/announcements';
import type { FailedAnnouncement } from '../api/announcements';
import { newsKeys } from '../../news/api/queries';

/** Shows the change at once and undoes it if saving fails; if the draft changed meanwhile, the summary is read again. */
export function useSetReleaseMark(fingerprint: string, by: string) {
  const api = useApi();
  const client = useQueryClient();
  const setMarks = (marks: (old: ReleaseMark[]) => ReleaseMark[]) =>
    client.setQueryData<ReleaseOverview>(
      releaseKeys.overview,
      // The marks are only shown under a draft that was read.
      (o) =>
        o && {
          ...o,
          summary: { ...o.summary, marks: marks(o.summary.marks) },
        },
    );
  return useMutation({
    mutationFn: ({ mark, checked }: { mark: ReleaseMarkId; checked: boolean }) =>
      api.setReleaseMark(fingerprint, mark, checked),
    onMutate: ({ mark, checked }) => {
      const before = client.getQueryData<ReleaseOverview>(releaseKeys.overview);
      setMarks((old) => {
        const rest = old.filter((m) => m.mark !== mark);
        return checked
          ? [...rest, { mark, checkedBy: by, checkedAt: new Date().toISOString() }]
          : rest;
      });
      return { before };
    },
    onSuccess: ({ marks }) => setMarks(() => marks),
    onError: (e, _vars, context) => {
      // Without data, setQueryData changes nothing.
      client.setQueryData(releaseKeys.overview, context?.before);
      if (e instanceof ApiRequestError && e.status === 409) {
        void client.invalidateQueries({ queryKey: releaseKeys.overview });
      }
    },
  });
}

/** With an announcement, it is saved after publishing; if that fails, it is kept for «Guardar el anuncio». */
export function usePublishRelease() {
  const api = useApi();
  const client = useQueryClient();
  const refreshContent = useRefreshContent();
  return useMutation({
    mutationFn: ({
      overview,
      review,
      announcement,
    }: {
      overview: ReleaseOverview;
      review: ReviewList;
      announcement: AnnouncementDraft | null;
    }) =>
      api.publishRelease({
        fingerprint: overview.summary.fingerprint,
        title: releaseTitle(overview.summary),
        checks: reviewChecks(review),
        announcement,
      }),
    onSuccess: (result, { announcement }) => {
      if (result.announcement === 'failed' && announcement) {
        client.setQueryData<FailedAnnouncement>(announcementKeys.failed, {
          releaseId: result.id,
          draft: announcement,
        });
      }
      refreshContent();
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: releaseKeys.overview }),
        client.invalidateQueries({ queryKey: releaseKeys.log }),
        client.invalidateQueries({ queryKey: announcementKeys.list, exact: true }),
      ]),
  });
}

export function useRevertRelease() {
  const api = useApi();
  const client = useQueryClient();
  const refreshContent = useRefreshContent();
  return useMutation({
    mutationFn: (id: number) => api.revertRelease(id),
    onSuccess: refreshContent,
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: releaseKeys.overview }),
        client.invalidateQueries({ queryKey: releaseKeys.log }),
        client.invalidateQueries({ queryKey: announcementKeys.list, exact: true }),
        client.invalidateQueries({ queryKey: newsKeys.feed }),
      ]),
  });
}
