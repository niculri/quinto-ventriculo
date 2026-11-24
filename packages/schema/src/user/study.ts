// Zod schemas of the student's study data as the code uses it (card states, the review log, presets, preferences and
// settings); the web's study repository and its in-memory twin give and take these types.
import { z } from 'zod';

export const Phase = z.enum(['new', 'learning', 'review', 'relearning']);
export type Phase = z.infer<typeof Phase>;

export const QueueName = z.enum(['new', 'learn', 'day_learn', 'review']);
export type QueueName = z.infer<typeof QueueName>;

export const Rating = z.literal([1, 2, 3, 4]);

export const ActionName = z.enum([
  'answer',
  'bury_card',
  'bury_note',
  'suspend_card',
  'suspend_note',
  'flag',
  'unbury',
  'unsuspend',
  'forget',
]);
export type ActionName = z.infer<typeof ActionName>;

export const CardKey = z.object({ noteGuid: z.string(), ord: z.number() });
export type CardKey = z.infer<typeof CardKey>;

export const CardRef = CardKey.extend({ deckId: z.string() });
export type CardRef = z.infer<typeof CardRef>;

export const StoredCard = CardRef.extend({
  phase: Phase,
  /** Learning: `due` is a day (it passed the rollover). Reviews: always. */
  interday: z.boolean(),
  remainingSteps: z.number(),
  /** ISO time: the moment of a learning step today, or the start of the due day. */
  due: z.string().nullable(),
  interval: z.number(),
  stability: z.number().nullable(),
  difficulty: z.number().nullable(),
  reps: z.number(),
  lapses: z.number(),
  lastReview: z.string().nullable(),
  flag: z.number(),
  suspended: z.boolean(),
  buriedUntil: z.string().nullable(),
  leech: z.boolean(),
  updatedAt: z.string(),
  retiredAt: z.string().nullable().optional(),
});
export type StoredCard = z.infer<typeof StoredCard>;

export const CardStateFields = StoredCard.pick({
  phase: true,
  interday: true,
  remainingSteps: true,
  due: true,
  interval: true,
  stability: true,
  difficulty: true,
  reps: true,
  lapses: true,
  lastReview: true,
  suspended: true,
  leech: true,
});
export type CardStateFields = z.infer<typeof CardStateFields>;

export const StudyPreferences = z.object({
  timeZone: z.string(),
  dayStartsAt: z.number(),
  learnAheadMinutes: z.number(),
  newCardsIgnoreReviewLimit: z.boolean(),
  applyAllParentLimits: z.boolean(),
  fullAnki: z.boolean(),
  fourButtons: z.boolean(),
  welcomeSeen: z.boolean(),
  semester: z.number().nullable(),
  addedCourses: z.array(z.string()),
  removedCourses: z.array(z.string()),
  dismissed: z.array(z.string()),
});
export type StudyPreferences = z.infer<typeof StudyPreferences>;

/** What a list of the preferences gained and lost: saved over what is stored, not as a whole new list. */
export const ListPatch = z.object({ add: z.array(z.string()), remove: z.array(z.string()) });
export type ListPatch = z.infer<typeof ListPatch>;

/** Only what changed of the preferences, as save_study_preferences() takes it. */
export const PreferencesPatch = StudyPreferences.extend({
  addedCourses: ListPatch,
  removedCourses: ListPatch,
  dismissed: ListPatch,
}).partial();
export type PreferencesPatch = z.infer<typeof PreferencesPatch>;

export const UserPreset = z.object({
  id: z.string(),
  name: z.string(),
  replaces: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
  updatedAt: z.string(),
});
export type UserPreset = z.infer<typeof UserPreset>;

export const DeckSetting = z.object({
  deckId: z.string(),
  presetId: z.string().nullable(),
  authorPreset: z.string().nullable(),
});
export type DeckSetting = z.infer<typeof DeckSetting>;

export const DeckActivation = z.object({ deckId: z.string(), active: z.boolean() });
export type DeckActivation = z.infer<typeof DeckActivation>;

export const AssessmentSetting = z.object({
  deckId: z.string(),
  includeExtras: z.boolean(),
  newPerDay: z.number().nullable(),
  examDate: z.string().nullable().optional(),
  finalReviewDays: z.number().optional(),
  examDateSetAt: z.string().nullable().optional(),
});
export type AssessmentSetting = z.infer<typeof AssessmentSetting>;

export const DeckProgress = z.object({
  deckId: z.string(),
  seen: z.number(),
  newSuspended: z.number(),
  overdue: z.number(),
  newToday: z.number(),
  newYesterday: z.number(),
});
export type DeckProgress = z.infer<typeof DeckProgress>;

// As `home_counts()` gives it, in Unix seconds: «l» a learning step of today (`due` is its moment), «d» learning past
// a day and «r» a review (`due` is the start of its day).
export const HomeQueue = z.enum(['l', 'd', 'r']);

const HomeDueCard = z.object({
  noteGuid: z.string(),
  ord: z.number(),
  queue: HomeQueue,
  due: z.number(),
});
type HomeDueCard = z.infer<typeof HomeDueCard>;

export const HomeDeckCounts = z.object({
  deckId: z.string(),
  seen: z.number(),
  hiddenNew: z.number(),
  touched: z.number(),
  suspended: z.number(),
  recall: z.number(),
  due: z.array(HomeDueCard),
});
export type HomeDeckCounts = z.infer<typeof HomeDeckCounts>;

export const HomeCounts = z.object({ decks: z.array(HomeDeckCounts), truncated: z.boolean() });
export type HomeCounts = z.infer<typeof HomeCounts>;

export const AnswerToday = z.object({ deckId: z.string(), queueBefore: QueueName });
export type AnswerToday = z.infer<typeof AnswerToday>;

export const ReviewInput = z.object({
  card: CardRef,
  expectedUpdatedAt: z.string().nullable(),
  rating: Rating,
  queueBefore: QueueName,
  interval: z.number(),
  lastInterval: z.number(),
  durationMs: z.number(),
  rBefore: z.number().nullable().optional(),
  cardVersion: z.number().nullable().optional(),
  state: CardStateFields,
  bury: z.array(CardRef),
  buriedUntil: z.string().nullable(),
});
export type ReviewInput = z.infer<typeof ReviewInput>;

export const CardLogEntry = z.object({
  action: ActionName,
  reviewedAt: z.string(),
  rating: z.number().nullable(),
  queueBefore: QueueName.nullable(),
  phaseBefore: Phase,
  phaseAfter: Phase,
  /** Days (positive) or seconds (negative), as Anki's revlog. */
  interval: z.number().nullable(),
  stability: z.number().nullable(),
  difficulty: z.number().nullable(),
  durationMs: z.number().nullable(),
});
export type CardLogEntry = z.infer<typeof CardLogEntry>;

export const RatedAnswer = z.object({
  noteGuid: z.string(),
  ord: z.number(),
  rating: Rating,
  reviewedAt: z.string(),
});
export type RatedAnswer = z.infer<typeof RatedAnswer>;

export const UndoResult = CardRef.extend({ action: ActionName, rating: z.number().nullable() });
export type UndoResult = z.infer<typeof UndoResult>;

/**
 * The action the study screen is taking back: the database undoes nothing if its last one is another. `actionId` is
 * record_review()'s, when the screen has it.
 */
export const UndoExpected = CardRef.extend({ action: ActionName, actionId: z.string().optional() });
export type UndoExpected = z.infer<typeof UndoExpected>;

/** A card that moved or was taken out, as the API gives it: what reconcile_cards() receives. */
export { CardChange } from '../anki/flashcards';

export const ReconcileResult = z.object({
  applied: z.boolean(),
  syncedTo: z.number(),
  changed: z.number(),
});
export type ReconcileResult = z.infer<typeof ReconcileResult>;

export const PracticeCount = z.object({ deckId: z.string(), n: z.number() });
export type PracticeCount = z.infer<typeof PracticeCount>;
