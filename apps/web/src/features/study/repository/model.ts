// The study domain: card states, the review log, presets, preferences and settings, with their defaults, limits
// and errors, shared by the port, both repositories and the rest of the app.

export type Phase = 'new' | 'learning' | 'review' | 'relearning';
export type QueueName = 'new' | 'learn' | 'day_learn' | 'review';

export interface CardKey {
  noteGuid: string;
  ord: number;
}

export interface CardRef extends CardKey {
  deckId: string;
}

export interface StoredCard extends CardRef {
  phase: Phase;
  /** Learning: `due` is a day (it passed the rollover). Reviews: always. */
  interday: boolean;
  remainingSteps: number;
  /** ISO time: the moment of a learning step today, or the start of the due day. */
  due: string | null;
  interval: number;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  lastReview: string | null;
  flag: number;
  suspended: boolean;
  buriedUntil: string | null;
  leech: boolean;
  updatedAt: string;
  retiredAt?: string | null;
}

export type CardStateFields = Pick<
  StoredCard,
  | 'phase'
  | 'interday'
  | 'remainingSteps'
  | 'due'
  | 'interval'
  | 'stability'
  | 'difficulty'
  | 'reps'
  | 'lapses'
  | 'lastReview'
  | 'suspended'
  | 'leech'
>;

export interface StudyPreferences {
  timeZone: string;
  dayStartsAt: number;
  learnAheadMinutes: number;
  newCardsIgnoreReviewLimit: boolean;
  applyAllParentLimits: boolean;
  fullAnki: boolean;
  fourButtons: boolean;
  welcomeSeen: boolean;
  semester: number | null;
  addedCourses: string[];
  removedCourses: string[];
  dismissed: string[];
}

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

export interface UserPreset {
  id: string;
  name: string;
  replaces: string | null;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface DeckSetting {
  deckId: string;
  presetId: string | null;
  authorPreset: string | null;
}

export interface DeckActivation {
  deckId: string;
  active: boolean;
}

export interface AssessmentSetting {
  deckId: string;
  includeExtras: boolean;
  newPerDay: number | null;
  examDate?: string | null;
  finalReviewDays?: number;
  examDateSetAt?: string | null;
}

export interface DeckProgress {
  deckId: string;
  seen: number;
  newSuspended: number;
  overdue: number;
  newToday: number;
  newYesterday: number;
}

// As `home_counts()` gives it, in Unix seconds: «l» a learning step of today (`due` is its moment), «d» learning past
// a day and «r» a review (`due` is the start of its day).
export interface HomeDueCard {
  noteGuid: string;
  ord: number;
  queue: 'l' | 'd' | 'r';
  due: number;
}

export interface HomeDeckCounts {
  deckId: string;
  seen: number;
  hiddenNew: number;
  touched: number;
  suspended: number;
  recall: number;
  due: HomeDueCard[];
}

export interface HomeCounts {
  decks: HomeDeckCounts[];
  truncated: boolean;
}

export interface AnswerToday {
  deckId: string;
  queueBefore: QueueName;
}

export interface ReviewInput {
  card: CardRef;
  expectedUpdatedAt: string | null;
  rating: 1 | 2 | 3 | 4;
  queueBefore: QueueName;
  interval: number;
  lastInterval: number;
  durationMs: number;
  rBefore?: number | null;
  cardVersion?: number | null;
  state: CardStateFields;
  bury: CardRef[];
  buriedUntil: string | null;
}

export type ActionName =
  | 'answer'
  | 'bury_card'
  | 'bury_note'
  | 'suspend_card'
  | 'suspend_note'
  | 'flag'
  | 'unbury'
  | 'unsuspend'
  | 'forget';

export interface CardLogEntry {
  action: ActionName;
  reviewedAt: string;
  rating: number | null;
  queueBefore: QueueName | null;
  phaseBefore: Phase;
  phaseAfter: Phase;
  /** Days (positive) or seconds (negative), as Anki's revlog. */
  interval: number | null;
  stability: number | null;
  difficulty: number | null;
  durationMs: number | null;
}

export interface RatedAnswer {
  noteGuid: string;
  ord: number;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: string;
}

export interface UndoResult extends CardRef {
  action: ActionName;
  rating: number | null;
}

export interface CardChange {
  noteGuid: string;
  ord: number;
  deckId: string | null;
}

export interface ReconcileResult {
  applied: boolean;
  syncedTo: number;
  changed: number;
}

export interface PracticeCount {
  deckId: string;
  n: number;
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
