// The heatmap's groups for its page, computed once per catalog.

import { useMemo } from 'react';
import type { Catalog } from '@qv/schema';
import { heatmapGroups } from '../model/groups';
import type { GroupBy } from '../model/groups';

export function useHeatmapGroups(catalog: Catalog, groupBy: GroupBy, courseId?: string) {
  return useMemo(() => heatmapGroups(catalog, groupBy, courseId), [catalog, groupBy, courseId]);
}
