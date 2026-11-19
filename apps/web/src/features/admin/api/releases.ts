// What «Publicaciones» reads, with its keys: the draft's overview, its texts and images for the review list, the
// impact of each deck, the changes one by one and the record.
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { processPhrases } from '@qv/release-review';
import type {
  DeckImpact,
  ReleaseArticlePage,
  ReleaseCardPage,
  ReleaseOverview,
  ReleaseQuestionPage,
  ReleaseText,
} from '@qv/schema';
import type { ApiClient } from '../../../shared/lib/api';
import type { AdminRepository } from './repository';

/** Every key starts with «release»: the draft preview shares them. */
export const releaseKeys = {
  overview: ['release', 'overview'] as const,
  log: ['release', 'log'] as const,
  texts: (fp: string) => ['release', 'texts', fp] as const,
  media: (fp: string) => ['release', 'media', fp] as const,
  impact: (fp: string) => ['release', 'impact', fp] as const,
  items: (fp: string, assessment: string, kind: string) =>
    ['release', 'items', fp, assessment, kind] as const,
};

export const overviewQuery = (api: ApiClient, enabled: boolean) =>
  queryOptions({
    queryKey: releaseKeys.overview,
    queryFn: ({ signal }) => api.releaseOverview(signal),
    enabled,
    staleTime: 30_000,
  });

/** Every page of the draft's new texts, read for the phrases the review list warns about. */
export const phrasesQuery = (api: ApiClient, fingerprint: string | undefined) =>
  queryOptions({
    queryKey: releaseKeys.texts(fingerprint ?? ''),
    enabled: !!fingerprint,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const texts: ReleaseText[] = [];
      for (let after: string | null = null; ; ) {
        const page = await api.releaseTexts(after, signal);
        texts.push(...page.items);
        after = page.next;
        if (!after) break;
      }
      return processPhrases(texts);
    },
  });

/** Every page of the draft's images that the image store does not have. */
export const missingImagesQuery = (api: ApiClient, fingerprint: string | undefined) =>
  queryOptions({
    queryKey: releaseKeys.media(fingerprint ?? ''),
    enabled: !!fingerprint,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const missing: string[] = [];
      for (let after: string | null = null; ; ) {
        const page = await api.releaseMedia(after, signal);
        missing.push(...page.missing);
        after = page.next;
        if (!after) break;
      }
      return missing;
    },
  });

/** How many students saw the decks that change, 300 decks per call. */
export const impactQuery = (
  admin: AdminRepository,
  overview: ReleaseOverview | undefined,
  ids: string[],
) =>
  queryOptions({
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

type ReleaseItemsPage = ReleaseCardPage | ReleaseArticlePage | ReleaseQuestionPage;

export const itemsQuery = (
  api: ApiClient,
  fingerprint: string,
  assessment: string,
  kind: 'card' | 'article' | 'question',
) =>
  infiniteQueryOptions({
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

export const logQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: releaseKeys.log,
    queryFn: ({ signal }) => api.releaseLog(signal),
    staleTime: 30_000,
  });
