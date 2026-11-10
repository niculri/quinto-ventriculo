import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dayStartsAt, schedTiming } from '@qv/srs';
import type { DeckDetail } from '@qv/schema';
import { useServices } from '../../app/services';
import { browserTimeZone, defaultPreferences } from './repository';
import type { AssessmentSetting, StudyPreferences, UserPreset } from './repository';
import { useCatalog } from '../catalog/queries';
import { assessmentView } from './pace';
import type { AssessmentView } from './pace';
import { cardKey, deckIds, timingFor, treeDecks } from './scheduler';
import type { StudyData } from './scheduler';
import type { StudyPlan } from './simple';

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
  answers: (day: number) => ['study', 'answers', day] as const,
};

/** The user's preferences; the time zone follows the browser's (Anki uses the computer's). */
export function usePreferences() {
  const { study } = useServices();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: studyKeys.preferences,
    queryFn: () => study.preferences(),
    staleTime: 10 * 60_000,
  });
  const zone = browserTimeZone();
  const prefs = useMemo<StudyPreferences | undefined>(
    () =>
      query.data === undefined
        ? undefined
        : { ...(query.data ?? defaultPreferences(zone)), timeZone: zone },
    [query.data, zone],
  );
  // The stored zone is kept as the browser's: the statistics and other devices use it.
  useEffect(() => {
    if (query.data === undefined || query.data?.timeZone === zone) return;
    const next = { ...(query.data ?? defaultPreferences(zone)), timeZone: zone };
    void study.savePreferences(next).then(() => client.setQueryData(studyKeys.preferences, next));
  }, [client, query.data, study, zone]);
  return { ...query, prefs };
}

export function useSavePreferences() {
  const { study } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (p: StudyPreferences) => study.savePreferences(p),
    onSuccess: (_, p) => {
      client.setQueryData(studyKeys.preferences, p);
      void client.invalidateQueries({ queryKey: ['study', 'answers'] });
    },
  });
}

export function useUserPresets() {
  const { study } = useServices();
  return useQuery({
    queryKey: studyKeys.presets,
    queryFn: () => study.presets(),
    staleTime: 60_000,
  });
}

export function useDeckSettings() {
  const { study } = useServices();
  return useQuery({
    queryKey: studyKeys.settings,
    queryFn: () => study.deckSettings(),
    staleTime: 60_000,
  });
}

/** What the student chose for the simple Anki, with what comes from their progress. */
export function useStudyPlan() {
  const { study } = useServices();
  return useQuery({
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
}

const PLAN_CHANGE = ['study', 'plan-change'] as const;

/**
 * Changes the plan on the screen at once (the counts follow) and saves it behind; a failure takes it back. With
 * several changes on their way, the plan is read again only after the last one: reading it after the first would
 * bring it without the others, and their switches would jump back for a moment.
 */
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

/** Turns a week or a lecture on or off. */
export function useSetActivation() {
  const { study } = useServices();
  return usePlanChange<{ deckId: string; active: boolean }>(
    ({ deckId, active }) => study.setDeckActivation(deckId, active),
    (plan, a) => ({
      ...plan,
      activations: [...plan.activations.filter((x) => x.deckId !== a.deckId), a],
    }),
  );
}

/** «Incluir extras» and the new cards a day of an assessment. */
export function useSaveAssessmentSetting() {
  const { study } = useServices();
  return usePlanChange<AssessmentSetting>(
    (setting) => study.saveAssessmentSetting(setting),
    (plan, s) => ({
      ...plan,
      assessments: [...plan.assessments.filter((x) => x.deckId !== s.deckId), s],
    }),
  );
}

/** What the assessment mode needs to know of each of the user's decks, as of today. */
export function useDeckProgress(prefs: StudyPreferences | undefined) {
  const { study } = useServices();
  const today = useToday(prefs);
  return useQuery({
    queryKey: studyKeys.progress(today ?? -1),
    queryFn: () =>
      study.deckProgress(new Date(dayStartsAt(today!, prefs!.timeZone, prefs!.dayStartsAt) * 1000)),
    enabled: today !== null && !!prefs,
    staleTime: 30_000,
  });
}

/**
 * An assessment with its date, its pace and what they mean, for this student; null while it loads.
 */
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

/** The time, refreshed every `periodMs`. */
export function useNow(periodMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(id);
  }, [periodMs]);
  return now;
}

/** The day number now, refreshed every minute (the day starts at the rollover hour). */
export function useToday(prefs: StudyPreferences | undefined): number | null {
  const now = useNow();
  return prefs ? timingFor(prefs, now).today : null;
}

/** Today's answers (the daily limits), from the start of the student's day. */
export function useAnswersToday(prefs: StudyPreferences | undefined) {
  const { study } = useServices();
  const today = useToday(prefs);
  return useQuery({
    queryKey: studyKeys.answers(today ?? -1),
    queryFn: () =>
      study.answersSince(new Date(dayStartsAt(today!, prefs!.timeZone, prefs!.dayStartsAt) * 1000)),
    enabled: today !== null && !!prefs,
    staleTime: 30_000,
  });
}

/**
 * Everything needed to build a deck's queue: its cards' states, today's answers, the preferences, the
 * presets and the deck settings. `data` is undefined while something is missing.
 */
export function useStudyData(deck: DeckDetail | undefined) {
  const { study } = useServices();
  const preferences = usePreferences();
  const prefs = preferences.prefs;
  const catalog = useCatalog();
  const decks = useMemo(
    () => (catalog.data ? treeDecks(catalog.data.anki.decks) : undefined),
    [catalog.data],
  );
  const ids = useMemo(() => (deck ? deckIds(deck) : []), [deck]);
  const cards = useQuery({
    queryKey: studyKeys.cards(deck?.id ?? ''),
    queryFn: () => study.cards(ids),
    enabled: !!deck,
    staleTime: 30_000,
  });
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

/** After studying or changing options, what the deck page shows has to be read again. */
export function useInvalidateStudy() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: studyKeys.all });
}

export type { UserPreset };
