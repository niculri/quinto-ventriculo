// How the API reads and changes the site's settings (which semesters and courses show).
import type { SiteSettings, SiteSettingsUpdate } from '@qv/schema';

/** Outside the draft (it is not material): always the published schema's. */
export interface SiteSettingsRepository {
  get(): Promise<SiteSettings>;
  /** Changes only the keys it is given. */
  set(input: SiteSettingsUpdate & { by: string }): Promise<SiteSettings>;
}

const notConfigured = () => Promise.reject(new Error('The site settings are not configured'));

/** Nothing is hidden and nothing can be changed: the panel's route answers «no existe» before reaching it. */
export const NO_SETTINGS_REPOSITORY: SiteSettingsRepository = {
  get: notConfigured,
  set: notConfigured,
};
