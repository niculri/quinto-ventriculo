// Whether the thing exists only in the draft (an administrator's admin mode): it can be looked at, not studied or answered.
import { adminReasons } from '../model/adminOnly';
import type { Thing } from '../model/adminOnly';
import { useCatalog } from './useCatalog';

export function useDraftOnly(thing: Thing): boolean {
  const { data } = useCatalog();
  return adminReasons(data, thing).includes('draft');
}
