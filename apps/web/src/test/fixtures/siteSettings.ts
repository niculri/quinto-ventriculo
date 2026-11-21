// The site's settings as the panel reads them: nothing hidden, no list of courses.
import type { SiteSettingsView } from '@qv/schema';

export const NO_SETTINGS: SiteSettingsView = {
  hideEmptySemesters: false,
  hiddenCourses: [],
  updatedAt: null,
  updatedBy: null,
  semesters: [],
};
