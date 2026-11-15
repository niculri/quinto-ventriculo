// What the cards pages read: the answers a search by date needs.

import { queryOptions } from '@tanstack/react-query';
import type { StudyRepository } from '../../progress/api/repository';
import { studyKeys } from '../../progress/queries';

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
    queryKey: [...studyKeys.all, 'log', card.noteGuid, card.ord] as const,
    queryFn: () => study.cardLog(card),
    staleTime: 30_000,
  });
