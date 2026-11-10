import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dayStartsAt } from '@qv/srs';
import type { Catalog } from '@qv/schema';
import { useServices } from '../../app/services';
import { buildAnkiTree, courseDeck, descendants } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import {
  studyKeys,
  useAnswersToday,
  useDeckProgress,
  useDeckSettings,
  usePreferences,
  useStudyPlan,
  useToday,
  useUserPresets,
} from '../study/queries';
import type { HomeDeckCounts } from '../study/repository';
import { treeDecks } from '../study/scheduler';
import { activeUnits } from '../study/simple';
import type { StudyPlan } from '../study/simple';
import { decayByDeck, nextChangeAt } from './counts';
import type { HomeStudyBase } from './counts';

/**
 * The courses of «Hoy»: those with a week or lecture on, or with something answered (the decks the student answered
 * count as on, as everywhere). In the catalog's order.
 */
export function todayCourses(catalog: Catalog, plan: StudyPlan): CourseDeckNode[] {
  const tree = buildAnkiTree(catalog);
  const answered = new Set(plan.answeredDecks);
  return catalog.semesters
    .flatMap((s) => s.courses)
    .map((c) => courseDeck(tree, c.id))
    .filter((n): n is CourseDeckNode => n !== null)
    .filter((n) => {
      const below = descendants(n);
      return activeUnits(below, plan).size > 0 || below.some((d) => answered.has(d.id));
    });
}

/**
 * What «Hoy» needs, without any deck (plan step 3.2): the catalog's tree, the student's options and today's answers,
 * and `home_counts()` for the decks of those courses. `home` is null while something is missing.
 */
export function useHomeStudy(catalog: Catalog | undefined, courses: readonly CourseDeckNode[]) {
  const { study } = useServices();
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

/**
 * A number that changes when the counts can change by themselves (a learning step coming within the learn-ahead limit;
 * plan step 3.2, E6): the counts are computed again then, not every minute.
 */
export function useCountsTick(
  home: ReadonlyMap<string, HomeDeckCounts> | null,
  learnAheadMinutes: number | undefined,
) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!home || learnAheadMinutes === undefined) return;
    const at = nextChangeAt(home, learnAheadMinutes);
    if (at === null) return;
    // setTimeout takes at most ~24 days; the day changes before that.
    const id = setTimeout(() => setTick((t) => t + 1), Math.min(at - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [home, learnAheadMinutes, tick]);
  return tick;
}
