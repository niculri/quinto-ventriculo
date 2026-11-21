// Why an administrator sees something that a student does not: what the catalog of the admin mode says of it.
import { adminKey } from '@qv/schema/http';
import type { AdminKind, AdminReason } from '@qv/schema/http';
import type { Catalog } from '@qv/schema';

export type Thing = readonly [kind: AdminKind, id: string | number];

/** Every reason, also the ones it takes from what holds it (a note of a course that is off). Empty for a student. */
export function adminReasons(
  catalog: Catalog | null | undefined,
  [kind, id]: Thing,
): AdminReason[] {
  return catalog?.adminOnly?.[adminKey(kind, id)] ?? [];
}

/** The reasons that are its own: in a list, what holds it already says the rest. */
export function ownReasons(
  catalog: Catalog | null | undefined,
  thing: Thing,
  holder: Thing,
): AdminReason[] {
  const held = adminReasons(catalog, holder);
  return adminReasons(catalog, thing).filter((r) => !held.includes(r));
}
