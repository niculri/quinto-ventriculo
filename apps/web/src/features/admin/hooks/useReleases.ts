// What «Publicaciones» shows: the draft's overview, its review list, the impact of each deck, the changes one by one
// and the record.
import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { buildReview } from '@qv/release-review';
import type { ReviewList } from '@qv/release-review';
import type { ReleaseOverview } from '@qv/schema';
import { useApi } from '../../../shared/hooks/useApi';
import { useAdminRepository } from '../api/context';
import {
  impactQuery,
  itemsQuery,
  logQuery,
  missingImagesQuery,
  overviewQuery,
  phrasesQuery,
} from '../api/releases';
import { santiagoToday } from '../model/releases';

export function useReleaseOverview(enabled: boolean) {
  const api = useApi();
  return useQuery(overviewQuery(api, enabled));
}

function useReleasePhrases(fingerprint: string | undefined) {
  const api = useApi();
  return useQuery(phrasesQuery(api, fingerprint));
}

function useMissingImages(fingerprint: string | undefined) {
  const api = useApi();
  return useQuery(missingImagesQuery(api, fingerprint));
}

export function useReleaseImpact(overview: ReleaseOverview | undefined) {
  const admin = useAdminRepository();
  const ids = useMemo(
    () => [
      ...new Set(
        (overview?.summary.assessments ?? []).flatMap((a) => a.impactDecks.map((d) => d.id)),
      ),
    ],
    [overview],
  );
  return useQuery(impactQuery(admin, overview, ids));
}

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

export function useReleaseItems<K extends 'card' | 'article' | 'question'>(
  fingerprint: string,
  assessment: string,
  kind: K,
) {
  const api = useApi();
  return useInfiniteQuery(itemsQuery(api, fingerprint, assessment, kind));
}

export function useReleaseLog() {
  const api = useApi();
  return useQuery(logQuery(api));
}
