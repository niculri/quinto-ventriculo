// What studying reads, with its keys: preferences, presets, deck settings, the simple plan, deck progress, today's
// answers and a deck's cards. Everything under `studyKeys.all`, so ending a study session reads it again.
import { queryOptions } from '@tanstack/react-query';
import { dayStartsAt } from '@qv/srs';
import type { StudyPlan } from '@qv/study';
import type { StudyPreferences, StudyRepository } from './repository';

export const studyKeys = {
  all: ['study'] as const,
  preferences: ['study', 'preferences'] as const,
  presets: ['study', 'presets'] as const,
  settings: ['study', 'deck-settings'] as const,
  plan: ['study', 'plan'] as const,
  progress: (day: number) => ['study', 'progress', day] as const,
  cards: (deckId: string) => ['study', 'cards', deckId] as const,
  allCards: ['study', 'all-cards'] as const,
  rated: (since: number) => ['study', 'rated', since] as const,
  introduced: (since: number) => ['study', 'introduced', since] as const,
  allAnswers: ['study', 'answers'] as const,
  answers: (day: number) => ['study', 'answers', day] as const,
};

export const preferencesQuery = (study: StudyRepository) =>
  queryOptions({
    queryKey: studyKeys.preferences,
    queryFn: () => study.preferences(),
    staleTime: 10 * 60_000,
  });

export const userPresetsQuery = (study: StudyRepository) =>
  queryOptions({
    queryKey: studyKeys.presets,
    queryFn: () => study.presets(),
    staleTime: 60_000,
  });

export const deckSettingsQuery = (study: StudyRepository) =>
  queryOptions({
    queryKey: studyKeys.settings,
    queryFn: () => study.deckSettings(),
    staleTime: 60_000,
  });

export const studyPlanQuery = (study: StudyRepository) =>
  queryOptions({
    queryKey: studyKeys.plan,
    queryFn: async (): Promise<StudyPlan> => {
      const [activations, assessments, answeredDecks, medianAnswerMs] = await Promise.all([
        study.deckActivations(),
        study.assessmentSettings(),
        study.answeredDecks(),
        study.medianAnswerMs(),
      ]);
      return { activations, assessments, answeredDecks, medianAnswerMs };
    },
    staleTime: 30_000,
  });

export const deckProgressQuery = (
  study: StudyRepository,
  today: number | null,
  prefs: StudyPreferences | undefined,
) =>
  queryOptions({
    queryKey: studyKeys.progress(today ?? -1),
    queryFn: () =>
      study.deckProgress(new Date(dayStartsAt(today!, prefs!.timeZone, prefs!.dayStartsAt) * 1000)),
    enabled: today !== null && !!prefs,
    staleTime: 30_000,
  });

export const answersTodayQuery = (
  study: StudyRepository,
  today: number | null,
  prefs: StudyPreferences | undefined,
) =>
  queryOptions({
    queryKey: studyKeys.answers(today ?? -1),
    queryFn: () =>
      study.answersSince(new Date(dayStartsAt(today!, prefs!.timeZone, prefs!.dayStartsAt) * 1000)),
    enabled: today !== null && !!prefs,
    staleTime: 30_000,
  });

export const studyCardsQuery = (
  study: StudyRepository,
  deckId: string,
  ids: string[],
  enabled: boolean,
) =>
  queryOptions({
    queryKey: studyKeys.cards(deckId),
    queryFn: () => study.cards(ids),
    enabled,
    staleTime: 30_000,
  });
