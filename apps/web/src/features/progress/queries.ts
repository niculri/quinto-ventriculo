// Data hooks for studying: preferences, the simple plan and its changes, deck progress, an assessment's view,
// today's answers and everything a deck's queue needs.

import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useCatalog } from '../catalog/hooks/useCatalog';
import { assessmentView, cardKey, deckIds, timingFor, treeDecks } from '@qv/study';
import type { AssessmentView, StudyData, StudyPlan } from '@qv/study';
import { useNow } from '../../shared/hooks/useNow';

// The keys live with the reads (`api/queries.ts`); most features take them from here.
export { studyKeys };

/** The user's preferences; the time zone follows the browser's (Anki uses the computer's). */
export function usePreferences() {
  const study = useStudyRepository();
  const client = useQueryClient();
  const query = useQuery(preferencesQuery(study));
  const zone = browserTimeZone();
  const prefs = useMemo<StudyPreferences | undefined>(
    () =>
      query.data === undefined
        ? undefined
        : { ...(query.data ?? defaultPreferences(zone)), timeZone: zone },
    [query.data, zone],
  );
  // The stored zone is kept as the browser's: the statistics and other devices use it.
  const { mutate: saveZone } = useMutation({
    mutationFn: (next: StudyPreferences) => study.savePreferences(next),
    onSuccess: (_, next) => client.setQueryData(studyKeys.preferences, next),
  });
  useEffect(() => {
    if (query.data === undefined || query.data?.timeZone === zone) return;
    saveZone({ ...(query.data ?? defaultPreferences(zone)), timeZone: zone });
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

export function useDeckProgress(prefs: StudyPreferences | undefined) {
  const study = useStudyRepository();
  const today = useToday(prefs);
  return useQuery(deckProgressQuery(study, today, prefs));
}

export function useAssessmentView(assessmentId: string | null): AssessmentView | null {
  const { prefs } = usePreferences();
  const plan = useStudyPlan();
  const progress = useDeckProgress(prefs);
  const today = useToday(prefs);
  const catalog = useCatalog();
  const decks = useMemo(
    () => (catalog.data ? treeDecks(catalog.data.anki.decks) : undefined),
    [catalog.data],
  );
  return useMemo(
    () =>
      assessmentId === null || !prefs || !plan.data || !progress.data || !decks || today === null
        ? null
        : assessmentView({
            decks,
            plan: plan.data,
            progress: progress.data,
            assessmentId,
            today,
            prefs,
          }),
    [assessmentId, decks, plan.data, prefs, progress.data, today],
  );
}

/** Today's day number before the preferences arrive, with the usual rollover: what a date field can start from. */
export function roughToday(): number {
  return schedTiming(Date.now() / 1000, browserTimeZone(), defaultPreferences().dayStartsAt).today;
}

export function useToday(prefs: StudyPreferences | undefined): number | null {
  const now = useNow();
  return prefs ? timingFor(prefs, now).today : null;
}

export function useAnswersToday(prefs: StudyPreferences | undefined) {
  const study = useStudyRepository();
  const today = useToday(prefs);
  return useQuery(answersTodayQuery(study, today, prefs));
}

export function useStudyData(deck: DeckDetail | undefined) {
  const study = useStudyRepository();
  const preferences = usePreferences();
  const prefs = preferences.prefs;
  const catalog = useCatalog();
  const decks = useMemo(
    () => (catalog.data ? treeDecks(catalog.data.anki.decks) : undefined),
    [catalog.data],
  );
  const ids = useMemo(() => (deck ? deckIds(deck) : []), [deck]);
  const cards = useQuery(studyCardsQuery(study, deck?.id ?? '', ids, !!deck));
  const answers = useAnswersToday(prefs);
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const plan = useStudyPlan();
  const progress = useDeckProgress(prefs);
  const parts = [catalog, preferences, cards, answers, presets, settings, plan, progress];
  const error = parts.find((p) => p.isError)?.error ?? null;
  const data = useMemo<StudyData | undefined>(() => {
    if (
      !deck ||
      !decks ||
      !catalog.data ||
      !prefs ||
      !cards.data ||
      !answers.data ||
      !presets.data ||
      !settings.data ||
      !plan.data ||
      !progress.data
    ) {
      return undefined;
    }
    return {
      deck,
      decks,
      authorPresets: catalog.data.anki.presets,
      rows: new Map(cards.data.map((r) => [cardKey(r), r])),
      answers: answers.data,
      prefs,
      presets: presets.data,
      settings: settings.data,
      plan: plan.data,
      progress: progress.data,
    };
  }, [
    deck,
    decks,
    catalog.data,
    prefs,
    cards.data,
    answers.data,
    presets.data,
    settings.data,
    plan.data,
    progress.data,
  ]);
  return {
    data,
    error,
    retry: () => parts.forEach((p) => p.isError && void p.refetch()),
  };
}
