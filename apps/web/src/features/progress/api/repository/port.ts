// The port of the user's study data: what the Supabase adapter and the in-memory repository both implement.
import type { HeatmapData } from '@qv/study';
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
  RatedAnswer,
  ReconcileResult,
  ReviewInput,
  StoredCard,
  StudyPreferences,
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
  savePreferences: (p: StudyPreferences) => Promise<void>;
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
  setDeckActivation: (deckId: string, active: boolean) => Promise<void>;
  assessmentSettings: () => Promise<AssessmentSetting[]>;
  saveAssessmentSetting: (setting: AssessmentSetting) => Promise<void>;
  answeredDecks: () => Promise<string[]>;
  medianAnswerMs: () => Promise<number | null>;
  deckProgress: (dayStart: Date) => Promise<DeckProgress[]>;
  recordReview: (input: ReviewInput) => Promise<{ updatedAt: string }>;
  bury: (cards: CardRef[], until: Date, note: boolean) => Promise<void>;
  suspend: (cards: CardRef[], note: boolean) => Promise<void>;
  setFlag: (card: CardRef, flag: number) => Promise<void>;
  setFlags: (cards: CardRef[], flag: number) => Promise<void>;
  unsuspend: (cards: CardRef[]) => Promise<void>;
  unbury: (cards: CardRef[]) => Promise<void>;
  forget: (cards: CardRef[], resetCounts: boolean) => Promise<void>;
  undo: () => Promise<UndoResult | null>;
  heatmap: (deckIds: string[] | null) => Promise<HeatmapData>;
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
