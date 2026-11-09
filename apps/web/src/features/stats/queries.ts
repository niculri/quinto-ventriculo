import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { studyKeys } from '../study/queries';

/** Under the study's keys: ending a study session (which invalidates them all) reads the heatmap again. */
export const heatmapKeys = {
  all: [...studyKeys.all, 'heatmap'] as const,
  /** 'all' for the home page, a course's id for its page. */
  scope: (scope: string) => [...studyKeys.all, 'heatmap', scope] as const,
};

/** The heatmap of these decks (null: all of the student's), kept 5 minutes. */
export function useHeatmapData(scope: string, deckIds: string[] | null) {
  const { study } = useServices();
  return useQuery({
    queryKey: heatmapKeys.scope(scope),
    queryFn: () => study.heatmap(deckIds),
    staleTime: 5 * 60_000,
  });
}
