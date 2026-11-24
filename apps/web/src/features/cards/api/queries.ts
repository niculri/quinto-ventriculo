// What the cards pages read, with their keys: the card indexes and thumbnails from the API, and from the student's
// progress their rows, the answers a search or a day needs, the failed cards and a card's history.

import { queryOptions } from '@tanstack/react-query';
import { dayStartsAt } from '@qv/srs';
import { cardKey } from '@qv/study';
import type { ApiClient } from '../../../shared/lib/api';
import { CONTENT_QUERY } from '../../../shared/lib/contentQuery';
import type { StudyPreferences, StudyRepository } from '../../progress/api/repository';
import { studyKeys } from '../../progress/queries';
import { heatmapKeys } from '../../stats/api/queries';
import type { CardsScope } from '../../catalog/model/scope';
import { deckKeys } from '../../decks/api/queries';

const cardsKeys = {
  index: (assessmentId: string, hash: string) => ['card-index', assessmentId, hash] as const,
  thumbs: ['card-thumbs'] as const,
  failed: (since: number) => [...studyKeys.all, 'failed', since] as const,
  day: (scope: string, day: string) => [...studyKeys.all, 'cards-day', scope, day] as const,
  log: (noteGuid: string, ord: number) => [...studyKeys.all, 'log', noteGuid, ord] as const,
};

/** An index does not change while its hash is the same (its file is named by its content). */
export const cardIndexQuery = (api: ApiClient, r: { id: string; hash: string }) =>
  queryOptions({
    queryKey: cardsKeys.index(r.id, r.hash),
    queryFn: ({ signal }: { signal: AbortSignal }) => api.cardIndex(r.id, r.hash, signal),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

export const thumbsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: cardsKeys.thumbs,
    queryFn: ({ signal }) => api.thumbSignature(signal),
    staleTime: 10 * 60_000,
  });

export const scopeRowsQuery = (study: StudyRepository, scope: CardsScope | null) =>
  queryOptions({
    queryKey: studyKeys.cards(scope?.node.id ?? ''),
    queryFn: () => study.cards(scope!.deckIds),
    enabled: !!scope,
    staleTime: 30_000,
  });

/** The cards failed since a day's start, for «Falladas hace poco». */
export const failedQuery = (study: StudyRepository, since: number, enabled: boolean) =>
  queryOptions({
    queryKey: cardsKeys.failed(since),
    queryFn: async () =>
      new Set(
        (await study.ratedSince(new Date(since * 1000)))
          .filter((a) => a.rating === 1)
          .map((a) => cardKey(a)),
      ),
    enabled,
    staleTime: 30_000,
  });

/** Every deck's days, for the practice of a day (the home page's own reading). */
export const heatmapQuery = (study: StudyRepository, enabled: boolean) =>
  queryOptions({
    queryKey: heatmapKeys.scope('all'),
    queryFn: () => study.heatmap(null),
    enabled,
    staleTime: 5 * 60_000,
  });

/** The answers of a day of the heatmap, from its start to the next day's. */
export const dayAnswersQuery = ({
  study,
  scopeId,
  dayParam,
  day,
  prefs,
  enabled,
}: {
  study: StudyRepository;
  scopeId: string;
  dayParam: string;
  day: number | null;
  prefs: StudyPreferences | undefined;
  enabled: boolean;
}) =>
  queryOptions({
    queryKey: cardsKeys.day(scopeId, dayParam),
    queryFn: () =>
      study.ratedBetween(
        new Date(dayStartsAt(day!, prefs!.timeZone, prefs!.dayStartsAt) * 1000),
        new Date(dayStartsAt(day! + 1, prefs!.timeZone, prefs!.dayStartsAt) * 1000),
      ),
    enabled,
    staleTime: 30_000,
  });

/** The answers since a day's start, for `rated:`; off while the search has none. */
export const ratedQuery = (study: StudyRepository, since: number | null) =>
  queryOptions({
    queryKey: studyKeys.rated(since ?? 0),
    queryFn: () => study.ratedSince(new Date(since! * 1000)),
    enabled: since !== null,
    staleTime: 30_000,
  });

/** Each card's first answer since a day's start, for `introduced:`; off while the search has none. */
export const introducedQuery = (study: StudyRepository, since: number | null) =>
  queryOptions({
    queryKey: studyKeys.introduced(since ?? 0),
    queryFn: () => study.firstAnswersSince(new Date(since! * 1000)),
    enabled: since !== null,
    staleTime: 30_000,
  });

/** A card's history, for its information. */
export const cardLogQuery = (study: StudyRepository, card: { noteGuid: string; ord: number }) =>
  queryOptions({
    queryKey: cardsKeys.log(card.noteGuid, card.ord),
    queryFn: () => study.cardLog(card),
    staleTime: 30_000,
  });

/** The card the old browser's URL names, to find its deck; a card that is not there any more is not retried. */
export const legacyCardQuery = (
  api: ApiClient,
  note: string | null,
  ord: number,
  enabled: boolean,
) =>
  queryOptions({
    queryKey: deckKeys.card(note, ord),
    queryFn: ({ signal }) => api.card(note!, ord, signal),
    meta: CONTENT_QUERY,
    enabled,
    retry: false,
  });
