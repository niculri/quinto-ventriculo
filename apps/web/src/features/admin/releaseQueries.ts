import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildReview, processPhrases, releaseTitle, reviewChecks } from '@qv/schema';
import type {
  DeckImpact,
  ReleaseArticlePage,
  ReleaseCardPage,
  ReleaseQuestionPage,
  ReleaseMarkId,
  ReleaseOverview,
  ReleaseText,
  ReviewList,
} from '@qv/schema';
import { useServices } from '../../app/services';
import { ApiRequestError } from '../../lib/api';

/**
 * The release panel's reads (step 1.7, part 2). Every key starts with «release»: the preview of the draft shares them
 * (features/preview), they are about the draft anyway.
 */
export const releaseKeys = {
  overview: ['release', 'overview'] as const,
  log: ['release', 'log'] as const,
  texts: (fp: string) => ['release', 'texts', fp] as const,
  media: (fp: string) => ['release', 'media', fp] as const,
  impact: (fp: string) => ['release', 'impact', fp] as const,
  items: (fp: string, assessment: string, kind: string) =>
    ['release', 'items', fp, assessment, kind] as const,
};

/** Today in Santiago, YYYY-MM-DD. */
export const santiagoToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);

export function useReleaseOverview(enabled: boolean) {
  const { api } = useServices();
  return useQuery({
    queryKey: releaseKeys.overview,
    queryFn: ({ signal }) => api.releaseOverview(signal),
    enabled,
    staleTime: 30_000,
  });
}

/** Every page of the texts the draft adds or changes, and the process and calendar phrases in them. */
function useReleasePhrases(fingerprint: string | undefined) {
  const { api } = useServices();
  return useQuery({
    queryKey: releaseKeys.texts(fingerprint ?? ''),
    enabled: !!fingerprint,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const texts: ReleaseText[] = [];
      for (let after: string | null = null; ;) {
        const page = await api.releaseTexts(after, signal);
        texts.push(...page.items);
        after = page.next;
        if (!after) break;
      }
      return processPhrases(texts);
    },
  });
}

/** Every page of the new images, and which of them the image store does not have. */
function useMissingImages(fingerprint: string | undefined) {
  const { api } = useServices();
  return useQuery({
    queryKey: releaseKeys.media(fingerprint ?? ''),
    enabled: !!fingerprint,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const missing: string[] = [];
      for (let after: string | null = null; ;) {
        const page = await api.releaseMedia(after, signal);
        missing.push(...page.missing);
        after = page.next;
        if (!after) break;
      }
      return missing;
    },
  });
}

/** How many students each deck the release touches reaches (the users' database, by deck). */
export function useReleaseImpact(overview: ReleaseOverview | undefined) {
  const { admin } = useServices();
  const ids = useMemo(
    () => [
      ...new Set(
        (overview?.summary.assessments ?? []).flatMap((a) => a.impactDecks.map((d) => d.id)),
      ),
    ],
    [overview],
  );
  return useQuery({
    queryKey: releaseKeys.impact(overview?.summary.fingerprint ?? ''),
    enabled: !!overview && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out = new Map<string, DeckImpact>();
      for (let i = 0; i < ids.length; i += 300) {
        for (const d of await admin.deckImpact(ids.slice(i, i + 300))) out.set(d.deckId, d);
      }
      return out;
    },
  });
}

/** The review list of the draft as it is now, with the checks that need the texts and the images. */
export function useReleaseReview(overview: ReleaseOverview | undefined): {
  review: ReviewList | null;
  errors: unknown[];
} {
  const fp = overview?.summary.fingerprint;
  const phrases = useReleasePhrases(fp);
  const missing = useMissingImages(fp);
  const review = useMemo(
    () =>
      overview
        ? buildReview({
            summary: overview.summary,
            browseIndexes: overview.browseIndexes,
            supportedSchemaVersion: overview.supportedSchemaVersion,
            missingImages: missing.data ?? null,
            phrases: phrases.data ?? null,
            today: santiagoToday(),
          })
        : null,
    [overview, missing.data, phrases.data],
  );
  return { review, errors: [phrases.error, missing.error].filter(Boolean) };
}

/**
 * Checks or unchecks a mark by hand (at once on the screen, undone if it fails); if the draft changed meanwhile, the
 * summary is read again.
 */
export function useSetReleaseMark(fingerprint: string | undefined, by: string) {
  const { api } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ mark, checked }: { mark: ReleaseMarkId; checked: boolean }) =>
      api.setReleaseMark(fingerprint ?? '', mark, checked),
    onMutate: ({ mark, checked }) => {
      const before = client.getQueryData<ReleaseOverview>(releaseKeys.overview);
      client.setQueryData<ReleaseOverview>(releaseKeys.overview, (o) => {
        if (!o) return o;
        const rest = o.summary.marks.filter((m) => m.mark !== mark);
        const marks = checked
          ? [...rest, { mark, checkedBy: by, checkedAt: new Date().toISOString() }]
          : rest;
        return { ...o, summary: { ...o.summary, marks } };
      });
      return { before };
    },
    onSuccess: ({ marks }) => {
      client.setQueryData<ReleaseOverview>(releaseKeys.overview, (o) =>
        o ? { ...o, summary: { ...o.summary, marks } } : o,
      );
    },
    onError: (e, _vars, context) => {
      if (context?.before) client.setQueryData(releaseKeys.overview, context.before);
      if (e instanceof ApiRequestError && e.status === 409) {
        void client.invalidateQueries({ queryKey: releaseKeys.overview });
      }
    },
  });
}

type ReleaseItemsPage = ReleaseCardPage | ReleaseArticlePage | ReleaseQuestionPage;

/** The changes of one kind of one assessment, a page at a time («Ver más»). */
export function useReleaseItems<K extends 'card' | 'article' | 'question'>(
  fingerprint: string,
  assessment: string,
  kind: K,
) {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: releaseKeys.items(fingerprint, assessment, kind),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ReleaseItemsPage) => last.next,
    staleTime: Infinity,
    queryFn: ({ pageParam, signal }): Promise<ReleaseItemsPage> =>
      kind === 'card'
        ? api.releaseCards(assessment, pageParam, signal)
        : kind === 'article'
          ? api.releaseArticles(assessment, pageParam, signal)
          : api.releaseQuestions(assessment, pageParam, signal),
  });
}

/** The publications, newest first (step 1.7, part 3). */
export function useReleaseLog() {
  const { api } = useServices();
  return useQuery({
    queryKey: releaseKeys.log,
    queryFn: ({ signal }) => api.releaseLog(signal),
    staleTime: 30_000,
  });
}

/**
 * Publishes the draft the panel shows, with its review list. Then what the panel shows of the draft is read again
 * (the draft is what is published now), and the log.
 */
export function usePublishRelease() {
  const { api } = useServices();
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

/** Undoes the last publication; then the draft's differences (they are back) and the log are read again. */
export function useRevertRelease() {
  const { api } = useServices();
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
