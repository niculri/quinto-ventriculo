// The site's settings as the routes read them: kept a few seconds, and null when they cannot be read.
import type { SiteSettings } from '@qv/schema';
import type { Dependencies } from '../dependencies';

const NO_SETTINGS: SiteSettings = {
  hideEmptySemesters: false,
  hiddenCourses: [],
  updatedAt: null,
  updatedBy: null,
};

export interface SiteSettingsReader {
  /** Null when they cannot be read: what a course turned off hides must not show then. */
  read(): Promise<SiteSettings | null>;
  forget(): void;
}

export function siteSettingsReader(deps: Dependencies): SiteSettingsReader {
  let kept: { until: number; settings: SiteSettings } | null = null;
  return {
    async read() {
      if (!deps.configured.settings) return NO_SETTINGS;
      const t = Date.now();
      if (kept && kept.until > t) return kept.settings;
      try {
        const settings = await deps.settings.get();
        kept = { until: t + deps.settingsTtl, settings };
        return settings;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    forget() {
      kept = null;
    },
  };
}
