// How the API reads and changes the site's settings (which semesters and courses show).
import type { SiteSettings, SiteSettingsUpdate } from '@qv/schema';

/** Outside the draft (it is not material): always the published schema's. */
export interface SiteSettingsRepository {
  get(): Promise<SiteSettings>;
  /** Changes only the keys it is given. */
  set(input: SiteSettingsUpdate & { by: string }): Promise<SiteSettings>;
}
