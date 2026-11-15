// React Query keys of the heatmap data.
import { studyKeys } from '../../progress/queries';

// Under the study's keys, so that ending a study session reads the heatmap again.
export const heatmapKeys = {
  all: [...studyKeys.all, 'heatmap'] as const,
  scope: (scope: string) => [...studyKeys.all, 'heatmap', scope] as const,
};
