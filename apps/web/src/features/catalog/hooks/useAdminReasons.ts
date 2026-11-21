// Why the thing is shown to an administrator only (empty for a student): from the catalog of the admin mode.
import type { AdminReason } from '@qv/schema/http';
import { adminReasons, ownReasons } from '../model/adminOnly';
import type { Thing } from '../model/adminOnly';
import { useCatalog } from './useCatalog';

/** With `holder`, only the reasons that are its own: what holds it in the list already says the rest. */
export function useAdminReasons(thing: Thing, holder?: Thing): AdminReason[] {
  const { data } = useCatalog();
  return holder ? ownReasons(data, thing, holder) : adminReasons(data, thing);
}
