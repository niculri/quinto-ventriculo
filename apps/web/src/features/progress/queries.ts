// Data hooks for studying: preferences, the simple plan and its changes, deck progress, an assessment's view,
// today's answers and everything a deck's queue needs.

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { schedTiming } from '@qv/srs';
import type { DeckDetail } from '@qv/schema';
import { useStudyRepository } from './api/context';
import {
  answersTodayQuery,
  deckProgressQuery,
  deckSettingsQuery,
  preferencesQuery,
  studyCardsQuery,
  studyKeys,
  studyPlanQuery,
  userPresetsQuery,
} from './api/queries';
import { browserTimeZone, defaultPreferences } from './api/repository';
import type { AssessmentSetting, StudyPreferences } from './api/repository';
import { useStudentCatalog, useStudentDeck } from '../catalog/hooks/useStudentView';
import { assessmentView, cardKey, deckIds, timingFor, treeDecks } from '@qv/study';
import type { AssessmentView, StudyData, StudyPlan } from '@qv/study';
import { useNow } from '../../shared/hooks/useNow';

// The keys live with the reads (`api/queries.ts`); most features take them from here.
export { studyKeys };

/** The user's preferences; the time zone follows the browser's (Anki uses the computer's). */
export function usePreferences() {
  const study = useStudyRepository();
  const client = useQueryClient();
  const zone = browserTimeZone();
  // `select` keeps what is stored, to compare its zone, and the preferences with the browser's zone; React Query keeps
  // the same object while its content does not change.
  const query = useQuery({
    ...preferencesQuery(study),
    select: (stored) => ({
      stored,
      prefs: { ...(stored ?? defaultPreferences(zone)), timeZone: zone },
    }),
  });
  const prefs: StudyPreferences | undefined = query.data?.prefs;
  // The stored zone is kept as the browser's: the statistics and other devices use it.
  const { mutate: saveZone } = useMutation({
    mutationFn: (next: StudyPreferences) => study.savePreferences(next),
    onSuccess: (_, next) => client.setQueryData(studyKeys.preferences, next),
  });
  useEffect(() => {
    if (query.data === undefined || query.data.stored?.timeZone === zone) return;
    saveZone(query.data.prefs);
  }, [query.data, saveZone, zone]);
  return { ...query, prefs };
}

export function useSavePreferences() {
  const study = useStudyRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (p: StudyPreferences) => study.savePreferences(p),
    onSuccess: (_, p) => {
      client.setQueryData(studyKeys.preferences, p);
      void client.invalidateQueries({ queryKey: studyKeys.allAnswers });
    },
  });
}

export function useUserPresets() {
  const study = useStudyRepository();
  return useQuery(userPresetsQuery(study));
}

export function useDeckSettings() {
  const study = useStudyRepository();
  return useQuery(deckSettingsQuery(study));
}

export function useStudyPlan() {
  const study = useStudyRepository();
  return useQuery(studyPlanQuery(study));
}

const PLAN_CHANGE = ['study', 'plan-change'] as const;

// Shown at once and saved behind; with several changes on their way the plan is read again only after the last one,
// or the switches of the others would jump back for a moment.
function usePlanChange<T>(
  save: (value: T) => Promise<void>,
  apply: (p: StudyPlan, v: T) => StudyPlan,
) {
  const client = useQueryClient();
  const alone = () => client.isMutating({ mutationKey: PLAN_CHANGE }) === 1;
  return useMutation({
    mutationKey: PLAN_CHANGE,
    mutationFn: save,
    onMutate: async (value: T) => {
      await client.cancelQueries({ queryKey: studyKeys.plan });
      const before = client.getQueryData<StudyPlan>(studyKeys.plan);
      if (before) client.setQueryData(studyKeys.plan, apply(before, value));
      return { before };
    },
    onError: (_e, _v, context) => {
      if (context?.before && alone()) client.setQueryData(studyKeys.plan, context.before);
    },
    onSettled: () => (alone() ? client.invalidateQueries({ queryKey: studyKeys.plan }) : undefined),
  });
}

export function useSetActivation() {
  const study = useStudyRepository();
  return usePlanChange<{ deckId: string; active: boolean }>(
    ({ deckId, active }) => study.setDeckActivation(deckId, active),
    (plan, a) => ({
      ...plan,
      activations: [...plan.activations.filter((x) => x.deckId !== a.deckId), a],
    }),
  );
}

export function useSaveAssessmentSetting() {
  const study = useStudyRepository();
  return usePlanChange<AssessmentSetting>(
    (setting) => study.saveAssessmentSetting(setting),
    (plan, s) => ({
      ...plan,
      assessments: [...plan.assessments.filter((x) => x.deckId !== s.deckId), s],
    }),
  );
}

/** With `keepPrevious`, the day before is shown while the new day is read. */
export function useDeckProgress(prefs: StudyPreferences | undefined, keepPrevious = false) {
  const study = useStudyRepository();
  const today = useToday(prefs);
  return useQuery({
    ...deckProgressQuery(study, today, prefs),
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}

export function useAssessmentView(assessmentId: string | null): AssessmentView | null {
  const { prefs } = usePreferences();
  const plan = useStudyPlan();
  const progress = useDeckProgress(prefs);
  const today = useToday(prefs);
  const catalog = useStudentCatalog();
  // Each `data` is read before the condition: the compiler depends on a property only when it reads it without one,
  // and it would depend on the whole result of each query, which is new in each render.
  const catalogData = catalog.data;
  const planData = plan.data;
  const progressData = progress.data;
  const decks = catalogData ? treeDecks(catalogData.anki.decks) : undefined;
  return assessmentId === null || !prefs || !planData || !progressData || !decks || today === null
    ? null
    : assessmentView({
        decks,
        plan: planData,
        progress: progressData,
        assessmentId,
        today,
        prefs,
      });
}

/** Today's day number before the preferences arrive, with the usual rollover: what a date field can start from. */
export function roughToday(): number {
  return schedTiming(Date.now() / 1000, browserTimeZone(), defaultPreferences().dayStartsAt).today;
}

export function useToday(prefs: StudyPreferences | undefined): number | null {
  const now = useNow();
  return prefs ? timingFor(prefs, now).today : null;
}

/** With `keepPrevious`, the day before is shown while the new day is read. */
export function useAnswersToday(prefs: StudyPreferences | undefined, keepPrevious = false) {
  const study = useStudyRepository();
  const today = useToday(prefs);
  return useQuery({
    ...answersTodayQuery(study, today, prefs),
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}

/**
 * Over what the students have: in the admin mode, what only the draft has is not in the queue nor in the counts.
 * With `keepPrevious`, a new day does not leave it empty while what depends on the day is read again.
 */
export function useStudyData(shown: DeckDetail | undefined, keepPrevious = false) {
  const study = useStudyRepository();
  const preferences = usePreferences();
  const prefs = preferences.prefs;
  const catalog = useStudentCatalog();
  const studied = useStudentDeck(shown);
  const deck = studied.data;
  const ids = deck ? deckIds(deck) : [];
  const cards = useQuery(studyCardsQuery(study, deck?.id ?? '', ids, !!deck));
  const answers = useAnswersToday(prefs, keepPrevious);
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const plan = useStudyPlan();
  const progress = useDeckProgress(prefs, keepPrevious);
  const parts = [catalog, studied, preferences, cards, answers, presets, settings, plan, progress];
  const error = parts.find((p) => p.isError)?.error ?? null;
  // Each `data` is read before the condition: the compiler depends on a property only when it reads it without one.
  const catalogData = catalog.data;
  const cardRows = cards.data;
  const answersData = answers.data;
  const presetsData = presets.data;
  const settingsData = settings.data;
  const planData = plan.data;
  const progressData = progress.data;
  const data: StudyData | undefined =
    deck &&
    catalogData &&
    prefs &&
    cardRows &&
    answersData &&
    presetsData &&
    settingsData &&
    planData &&
    progressData
      ? {
          deck,
          decks: treeDecks(catalogData.anki.decks),
          authorPresets: catalogData.anki.presets,
          rows: new Map(cardRows.map((r) => [cardKey(r), r])),
          answers: answersData,
          prefs,
          presets: presetsData,
          settings: settingsData,
          plan: planData,
          progress: progressData,
        }
      : undefined;
  // With `keepPrevious`, the last whole data stays while a read fails (the new day's, at midnight): a round in progress
  // goes on. Kept as state from the previous renders, by the identity of what was read (stable without the compiler).
  const inputs = [
    deck,
    catalogData,
    prefs,
    cardRows,
    answersData,
    presetsData,
    settingsData,
    planData,
    progressData,
  ];
  const [kept, setKept] = useState<{ inputs: unknown[]; data: StudyData }>();
  if (keepPrevious && data && (!kept || inputs.some((x, i) => x !== kept.inputs[i]))) {
    setKept({ inputs, data });
  }
  return {
    data: data ?? (keepPrevious && error ? kept?.data : undefined),
    error,
    retry: () => parts.forEach((p) => p.isError && void p.refetch()),
  };
}
