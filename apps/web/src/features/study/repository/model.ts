// The study domain: card states, the review log, presets, preferences and settings (their types are the schemas of
// @qv/schema/user), with their defaults, limits and errors, shared by the port, both repositories and the rest of the app.
import type { StudyPreferences } from '@qv/schema/user';

export type {
  ActionName,
  AnswerToday,
  AssessmentSetting,
  CardChange,
  CardKey,
  CardLogEntry,
  CardRef,
  CardStateFields,
  DeckActivation,
  DeckProgress,
  DeckSetting,
  HomeCounts,
  HomeDeckCounts,
  PracticeCount,
  QueueName,
  RatedAnswer,
  ReconcileResult,
  ReviewInput,
  StoredCard,
  StudyPreferences,
  UndoResult,
  UserPreset,
} from '@qv/schema/user';

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

export const PRACTICE_BATCH_MAX = 1000;
export const PRACTICE_BATCH_DECKS = 100;
/** The database counts practice up to this a day and takes the rest without failing, so the final review goes on. */
export const PRACTICE_DAY_MAX = 5000;

/** The database refused a batch of practice (day's cap, too large, no longer invited): retrying would fail the same. */
export class PracticeRefusedError extends Error {}

export class CardChangedError extends Error {
  constructor() {
    super('Esta tarjeta cambió en otra pestaña o dispositivo.');
    this.name = 'CardChangedError';
  }
}
