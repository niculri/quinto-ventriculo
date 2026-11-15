// Today's study day, with the user's rollover, and a rough one before the preferences arrive.
import { schedTiming } from '@qv/srs';
import { timingFor } from '@qv/study';
import { useNow } from '../../../shared/hooks/useNow';
import { browserTimeZone, defaultPreferences } from '../api/repository';
import type { StudyPreferences } from '../api/repository';

/** Today's day number before the preferences arrive, with the usual rollover: what a date field can start from. */
export function roughToday(): number {
  return schedTiming(Date.now() / 1000, browserTimeZone(), defaultPreferences().dayStartsAt).today;
}

export function useToday(prefs: StudyPreferences | undefined): number | null {
  const now = useNow();
  return prefs ? timingFor(prefs, now).today : null;
}
