// The statistics of the student's own cards in a deck's scope, under the study's keys (studying reads them again).
import { queryOptions } from '@tanstack/react-query';
import { studyKeys } from '../../progress/api/queries';
import type { StudyRepository } from '../../progress/api/repository';

const cardStatsKeys = {
  scope: (nodeId: string) => [...studyKeys.all, 'card-stats', nodeId] as const,
};

export const cardStatsQuery = (study: StudyRepository, nodeId: string, deckIds: string[]) =>
  queryOptions({
    queryKey: cardStatsKeys.scope(nodeId),
    queryFn: () => study.cardStats(deckIds),
    staleTime: 60_000,
  });
