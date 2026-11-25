// The study domain: card states, the review log, presets, preferences and settings (their types are the schemas of
// @qv/schema/user), with their defaults, limits and errors, shared by the port, both repositories and the rest of the app.
export { browserTimeZone, defaultPreferences } from '@qv/study';

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
  PreferencesPatch,
  QueueName,
  RatedAnswer,
  ReconcileResult,
  ReviewInput,
  StoredCard,
  StudyPreferences,
  UndoExpected,
  UndoResult,
  UserPreset,
} from '@qv/schema/user';

/** The zone study_preferences gets when its first save does not bring one (its column's default). */
export const DATABASE_TIME_ZONE = 'America/Santiago';

export const PRACTICE_BATCH_MAX = 1000;
export const PRACTICE_BATCH_DECKS = 100;
/** The database counts practice up to this a day and takes the rest without failing, so the final review goes on. */
export const PRACTICE_DAY_MAX = 5000;

/** The database refused a batch of practice (day's cap, too large, no longer invited): retrying would fail the same. */
export class PracticeRefusedError extends Error {}

/**
 * The request got no answer (no connection, out of time, or a server that says «later»): it can be made again, and
 * what it asked for may have been done.
 */
export class ConnectionError extends Error {
  constructor(what: string) {
    super(`No se pudo ${what}: no hay conexión.`);
    this.name = 'ConnectionError';
  }
}

/** The users' database has no my_card_stats() yet: the web was deployed before its migration. */
export class StatsUnavailableError extends Error {
  constructor() {
    super('Tus estadísticas todavía no están disponibles. Vuelve a intentarlo más tarde.');
    this.name = 'StatsUnavailableError';
  }
}

export class CardChangedError extends Error {
  constructor() {
    super('Esta tarjeta cambió en otra pestaña o dispositivo.');
    this.name = 'CardChangedError';
  }
}

/** The user's last action is not the one this screen is undoing (another tab or device acted after it): nothing changed. */
export class UndoRefusedError extends Error {
  constructor() {
    super('No se pudo deshacer: hiciste algo después en otra pestaña o dispositivo.');
    this.name = 'UndoRefusedError';
  }
}
