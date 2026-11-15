// Everything a deck's queue needs, read together: the deck's cards, today's answers, the presets, the plan and more.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeckDetail } from '@qv/schema';
import { cardKey, deckIds, treeDecks } from '@qv/study';
import type { StudyData } from '@qv/study';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { useStudyRepository } from '../api/context';
import { studyCardsQuery } from '../api/queries';
import { usePreferences } from './usePreferences';
import { useAnswersToday, useDeckProgress } from './useDeckProgress';
import { useDeckSettings, useUserPresets } from './useStudySettings';
import { useStudyPlan } from './useStudyPlan';

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
