// The site's settings in memory, for the demo and the tests: they last as long as the process.
import type { SiteSettings } from '@qv/schema';
import type { SiteSettingsRepository } from '../repository';

export function memorySiteSettings(
  start: Partial<SiteSettings> = {},
  now: () => Date = () => new Date(),
): SiteSettingsRepository {
  let settings: SiteSettings = {
    hideEmptySemesters: false,
    updatedAt: null,
    updatedBy: null,
    ...start,
  };
  return {
    get: async () => settings,
    async set({ hideEmptySemesters, by }) {
      settings = { hideEmptySemesters, updatedAt: now().toISOString(), updatedBy: by };
      return settings;
    },
  };
}
