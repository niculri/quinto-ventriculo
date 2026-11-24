// The heatmap data, with its keys.
import { queryOptions } from '@tanstack/react-query';
import { studyKeys } from '../../progress/api/queries';
import type { StudyRepository } from '../../progress/api/repository';

// Under the study's keys, so that ending a study session reads the heatmap again.
export const heatmapKeys = {
  all: [...studyKeys.all, 'heatmap'] as const,
  scope: (scope: string) => [...studyKeys.all, 'heatmap', scope] as const,
};

export const heatmapQuery = (
  study: StudyRepository,
  scope: string,
  deckIds: string[] | null,
  quizIds: string[] | null,
) =>
  queryOptions({
    queryKey: heatmapKeys.scope(scope),
    queryFn: () => study.heatmap(deckIds, quizIds),
    staleTime: 5 * 60_000,
  });
