// The port of the user's study data: what the Supabase adapter and the in-memory repository both implement.
import type { CardStatsData, HeatmapData } from '@qv/study';
import type {
  AnswerToday,
  AssessmentSetting,
  CardChange,
  CardLogEntry,
  CardRef,
  DeckActivation,
  DeckProgress,
  DeckSetting,
  HomeCounts,
  PracticeCount,
  PreferencesPatch,
  RatedAnswer,
  ReconcileResult,
  ReviewInput,
  StoredCard,
  StudyPreferences,
  UndoExpected,
  UndoResult,
  UserPreset,
} from './model';

export interface StudyRepository {
  cards: (deckIds: string[]) => Promise<StoredCard[]>;
  allCards: () => Promise<StoredCard[]>;
  cardLog: (card: { noteGuid: string; ord: number }) => Promise<CardLogEntry[]>;
  ratedSince: (since: Date) => Promise<RatedAnswer[]>;
  ratedBetween: (from: Date, to: Date) => Promise<(RatedAnswer & { deckId: string })[]>;
  firstAnswersSince: (since: Date) => Promise<{ noteGuid: string; ord: number; at: string }[]>;
  answersSince: (since: Date) => Promise<AnswerToday[]>;
  preferences: () => Promise<StudyPreferences | null>;
  /** Saves only what changed and gives back the preferences as they are stored now. */
  savePreferences: (patch: PreferencesPatch) => Promise<StudyPreferences>;
  presets: () => Promise<UserPreset[]>;
  savePreset: (p: {
    id?: string;
    name: string;
    replaces: string | null;
    config: Record<string, unknown>;
  }) => Promise<UserPreset>;
  deletePreset: (id: string) => Promise<void>;
  deckSettings: () => Promise<DeckSetting[]>;
  setDeckPreset: (
    deckId: string,
    choice: { presetId: string } | { authorPreset: string } | null,
  ) => Promise<void>;
  deckActivations: () => Promise<DeckActivation[]>;
  /** Saved together: a week and its topics turn on or off at once. */
  setDeckActivations: (rows: DeckActivation[]) => Promise<void>;
  assessmentSettings: () => Promise<AssessmentSetting[]>;
  saveAssessmentSetting: (setting: AssessmentSetting) => Promise<void>;
  answeredDecks: () => Promise<string[]>;
  medianAnswerMs: () => Promise<number | null>;
  deckProgress: (dayStart: Date) => Promise<DeckProgress[]>;
  /** `actionId` names the answer for undoing it; a repository that answers without saving leaves it out. */
  recordReview: (input: ReviewInput) => Promise<{ updatedAt: string; actionId?: string }>;
  bury: (cards: CardRef[], until: Date, note: boolean) => Promise<void>;
  suspend: (cards: CardRef[], note: boolean) => Promise<void>;
  setFlag: (card: CardRef, flag: number) => Promise<void>;
  setFlags: (cards: CardRef[], flag: number) => Promise<void>;
  unsuspend: (cards: CardRef[]) => Promise<void>;
  unbury: (cards: CardRef[]) => Promise<void>;
  forget: (cards: CardRef[], resetCounts: boolean) => Promise<void>;
  /** The last action; with `expected`, only if it is that one (else UndoRefusedError). */
  undo: (expected?: UndoExpected) => Promise<UndoResult | null>;
  /** With `quizIds`, the questions of those tests only; without, of every test. */
  heatmap: (deckIds: string[] | null, quizIds?: string[] | null) => Promise<HeatmapData>;
  /** The statistics of the caller's own cards in those decks (all, with null). */
  cardStats: (deckIds: string[] | null) => Promise<CardStatsData>;
  recordPractice: (counts: PracticeCount[]) => Promise<void>;
  homeCounts: (
    deckIds: string[],
    until: Date,
    decay: Record<string, number>,
  ) => Promise<HomeCounts>;
  cardsSyncedTo: () => Promise<number>;
  reconcileCards: (input: {
    since: number;
    upTo: number;
    changes: CardChange[];
  }) => Promise<ReconcileResult>;
}
