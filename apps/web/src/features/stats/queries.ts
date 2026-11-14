// React Query keys and hook for the heatmap data.
import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { studyKeys } from '../study/queries';

// Under the study's keys, so that ending a study session reads the heatmap again.
export const heatmapKeys = {
  all: [...studyKeys.all, 'heatmap'] as const,
  scope: (scope: string) => [...studyKeys.all, 'heatmap', scope] as const,
};

export function useHeatmapData(scope: string, deckIds: string[] | null) {
  const { study } = useServices();
  return useQuery({
    queryKey: heatmapKeys.scope(scope),
    queryFn: () => study.heatmap(deckIds),
    staleTime: 5 * 60_000,
  });
}
