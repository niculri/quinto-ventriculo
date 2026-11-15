// The lines about the card browser's indexes, with each assessment named as the catalog has it.
import type { ReleaseOverview } from '@qv/schema';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { assessmentNames, indexLines } from '../model/releases';

export function useIndexLines(overview: ReleaseOverview): string[] {
  const catalog = useCatalog();
  return indexLines(overview, assessmentNames(catalog.data));
}
