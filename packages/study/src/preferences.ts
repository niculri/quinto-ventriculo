// The study preferences a student starts with, in the time zone of the device.
import type { StudyPreferences } from '@qv/schema/user';

export function defaultPreferences(timeZone = browserTimeZone()): StudyPreferences {
  return {
    timeZone,
    dayStartsAt: 4,
    learnAheadMinutes: 20,
    newCardsIgnoreReviewLimit: false,
    applyAllParentLimits: false,
    fullAnki: false,
    fourButtons: false,
    welcomeSeen: false,
    semester: null,
    addedCourses: [],
    removedCourses: [],
    dismissed: [],
  };
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
  } catch {
    return 'America/Santiago';
  }
}
