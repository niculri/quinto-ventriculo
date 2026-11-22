// What «Publicaciones» changes: a mark by hand (shown at once), publishing and undoing; then the overview and the
// record are read again.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { releaseTitle, reviewChecks } from '@qv/release-review';
import type { ReviewList } from '@qv/release-review';
import type { ReleaseMark, ReleaseMarkId, ReleaseOverview } from '@qv/schema';
import { useApi } from '../../../shared/hooks/useApi';
import { ApiRequestError } from '../../../shared/lib/api';
import { releaseKeys } from '../api/releases';

/** Shows the change at once and undoes it if saving fails; if the draft changed meanwhile, the summary is read again. */
export function useSetReleaseMark(fingerprint: string, by: string) {
  const api = useApi();
  const client = useQueryClient();
  const setMarks = (marks: (old: ReleaseMark[]) => ReleaseMark[]) =>
    client.setQueryData<ReleaseOverview>(
      releaseKeys.overview,
      // The marks are only shown under a draft that was read.
      (o) =>
        /* v8 ignore next */ o && {
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

export function usePublishRelease() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ overview, review }: { overview: ReleaseOverview; review: ReviewList }) =>
      api.publishRelease({
        fingerprint: overview.summary.fingerprint,
        title: releaseTitle(overview.summary),
        checks: reviewChecks(review),
      }),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: releaseKeys.overview }),
        client.invalidateQueries({ queryKey: releaseKeys.log }),
      ]),
  });
}

export function useRevertRelease() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.revertRelease(id),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: releaseKeys.overview }),
        client.invalidateQueries({ queryKey: releaseKeys.log }),
      ]),
  });
}
