// What the administration pages read, with their keys: the site settings, access, usage and the unpublished log (the
// admin role is in `isAdmin.ts`).
import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';
import { catalogKeys } from '../../catalog/api/queries';
import { isAdminKey } from './isAdmin';
import type { AdminRepository } from './repository';

/** The draft preview keeps some of these (`features/preview`): their first element is part of that contract. */
export const adminKeys = {
  isAdmin: isAdminKey,
  siteSettings: ['site-settings'] as const,
  access: ['access-report'] as const,
  usage: ['usage-report'] as const,
  unpublished: ['unpublished-log'] as const,
  /** After a change of the site settings the catalog is read again. */
  catalog: catalogKeys.catalog,
};

export const siteSettingsQuery = (api: ApiClient, enabled: boolean) =>
  queryOptions({
    queryKey: adminKeys.siteSettings,
    queryFn: ({ signal }) => api.siteSettings(signal),
    enabled,
  });

export const accessQuery = (admin: AdminRepository) =>
  queryOptions({ queryKey: adminKeys.access, queryFn: () => admin.accessReport() });

export const usageQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: adminKeys.usage,
    queryFn: ({ signal }) => api.usage(signal),
    staleTime: 60_000,
  });

export const unpublishedQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: adminKeys.unpublished,
    queryFn: ({ signal }) => api.unpublishedLog(signal),
  });
