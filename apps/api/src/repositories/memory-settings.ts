// The site's settings in memory, for the demo and the tests: they last as long as the process.
import type { SiteSettings } from '@qv/schema';
import type { SiteSettingsRepository } from '../repository';

export function memorySiteSettings(
  start: Partial<SiteSettings> = {},
  now: () => Date = () => new Date(),
): SiteSettingsRepository {
  let settings: SiteSettings = {
    hideEmptySemesters: false,
    hiddenCourses: [],
    updatedAt: null,
    updatedBy: null,
    ...start,
  };
  return {
    get: async () => settings,
    async set({ by, hideEmptySemesters, hiddenCourses }) {
      settings = {
        hideEmptySemesters: hideEmptySemesters ?? settings.hideEmptySemesters,
        hiddenCourses: hiddenCourses ? [...new Set(hiddenCourses)].sort() : settings.hiddenCourses,
        updatedAt: now().toISOString(),
        updatedBy: by,
      };
      return settings;
    },
  };
}
