// The decks' progress, today's answers and an assessment's view.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assessmentView, treeDecks } from '@qv/study';
import type { AssessmentView } from '@qv/study';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { useStudyRepository } from '../api/context';
import { answersTodayQuery, deckProgressQuery } from '../api/queries';
import type { StudyPreferences } from '../api/repository';
import { usePreferences } from './usePreferences';
import { useStudyPlan } from './useStudyPlan';
import { useToday } from './useToday';

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

export function useAnswersToday(prefs: StudyPreferences | undefined) {
  const study = useStudyRepository();
  const today = useToday(prefs);
  return useQuery(answersTodayQuery(study, today, prefs));
}
