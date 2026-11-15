// The heatmap data of a scope: the days studied and the cards due.
import { useQuery } from '@tanstack/react-query';
import { useStudyRepository } from '../../progress/api/context';
import { heatmapQuery } from '../api/queries';

export function useHeatmapData(scope: string, deckIds: string[] | null) {
  const study = useStudyRepository();
  return useQuery(heatmapQuery(study, scope, deckIds));
}
