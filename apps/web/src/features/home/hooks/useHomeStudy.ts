// What «Hoy» on the home page counts with: the study data of the courses it lists and their counts.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Catalog } from '@qv/schema';
import { useStudyRepository } from '../../progress/api/context';
import { descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useAnswersToday, useDeckProgress } from '../../progress/hooks/useDeckProgress';
import { useDeckSettings, useUserPresets } from '../../progress/hooks/useStudySettings';
import { usePreferences } from '../../progress/hooks/usePreferences';
import { useStudyPlan } from '../../progress/hooks/useStudyPlan';
import { useToday } from '../../progress/hooks/useToday';
import type { HomeDeckCounts } from '../../progress/api/repository';
import { treeDecks } from '@qv/study';
import type { HomeStudyBase } from '@qv/study';
import { homeCountsQuery } from '../api/queries';

export function useHomeStudy(catalog: Catalog | undefined, courses: readonly CourseDeckNode[]) {
  const study = useStudyRepository();
  const preferences = usePreferences();
  const prefs = preferences.prefs;
  const today = useToday(prefs);
  const plan = useStudyPlan();
  const progress = useDeckProgress(prefs);
  const answers = useAnswersToday(prefs);
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const decks = useMemo(() => (catalog ? treeDecks(catalog.anki.decks) : undefined), [catalog]);
  const base = useMemo<HomeStudyBase | undefined>(
    () =>
      catalog &&
      decks &&
      prefs &&
      plan.data &&
      progress.data &&
      answers.data &&
      presets.data &&
      settings.data
        ? {
            decks,
            authorPresets: catalog.anki.presets,
            answers: answers.data,
            prefs,
            presets: presets.data,
            settings: settings.data,
            plan: plan.data,
            progress: progress.data,
          }
        : undefined,
    [catalog, decks, prefs, plan.data, progress.data, answers.data, presets.data, settings.data],
  );
  const ids = useMemo(() => courses.flatMap((c) => descendants(c).map((d) => d.id)), [courses]);
  const home = useQuery(homeCountsQuery(study, today, prefs, base, ids));
  const parts = [preferences, plan, progress, answers, presets, settings, home];
  return {
    base,
    home: ids.length === 0 ? EMPTY : (home.data ?? null),
    error: parts.find((p) => p.isError)?.error ?? null,
    retry: () => parts.forEach((p) => p.isError && void p.refetch()),
  };
}

const EMPTY = { truncated: false, decks: new Map<string, HomeDeckCounts>() };
