// Whether whoever looks is an administrator: the site's menu asks it from the start, so it is apart from what the
// administration pages read (`queries.ts`), which then loads only with them.
import { queryOptions } from '@tanstack/react-query';
import type { AdminRepository } from './repository';

export const isAdminKey = ['is-admin'] as const;

/** Only shows or hides the panel: the database enforces who is an administrator. */
export const isAdminQuery = (admin: AdminRepository) =>
  queryOptions({
    queryKey: isAdminKey,
    queryFn: () => admin.isAdmin(),
    staleTime: 10 * 60_000,
    // A failure here only hides the panel: it must not bother anybody.
    retry: false,
  });
