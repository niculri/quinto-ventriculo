// What «Hoy» on the home page counts with: the study data of the courses it lists and their counts.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dayStartsAt } from '@qv/srs';
import type { Catalog } from '@qv/schema';
import { useStudyRepository } from '../../progress/api/context';
import { descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import {
  studyKeys,
  useAnswersToday,
  useDeckProgress,
  useDeckSettings,
  usePreferences,
  useStudyPlan,
  useToday,
  useUserPresets,
} from '../../progress/queries';
import type { HomeDeckCounts } from '../../progress/api/repository';
import { decayByDeck, treeDecks } from '@qv/study';
import type { HomeStudyBase } from '@qv/study';

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
  const home = useQuery({
    queryKey: [...studyKeys.all, 'home', today ?? -1, ids.join(',')] as const,
    queryFn: async () => {
      const until = new Date(dayStartsAt(today! + 1, prefs!.timeZone, prefs!.dayStartsAt) * 1000);
      const r = await study.homeCounts(ids, until, decayByDeck(base!, ids));
      return { truncated: r.truncated, decks: new Map(r.decks.map((d) => [d.deckId, d])) };
    },
    enabled: !!base && today !== null && ids.length > 0,
    staleTime: 30_000,
  });
  const parts = [preferences, plan, progress, answers, presets, settings, home];
  return {
    base,
    home: ids.length === 0 ? EMPTY : (home.data ?? null),
    error: parts.find((p) => p.isError)?.error ?? null,
    retry: () => parts.forEach((p) => p.isError && void p.refetch()),
  };
}

const EMPTY = { truncated: false, decks: new Map<string, HomeDeckCounts>() };
