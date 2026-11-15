// What the home page reads, with its keys: the tests half done and the counts of «Hoy».

import { queryOptions } from '@tanstack/react-query';
import { dayStartsAt } from '@qv/srs';
import { decayByDeck } from '@qv/study';
import type { HomeStudyBase } from '@qv/study';
import { studyKeys } from '../../progress/api/queries';
import type { StudyPreferences, StudyRepository } from '../../progress/api/repository';
import type { QuizRepository } from '../../quiz/api/repository';

const homeKeys = {
  openRounds: ['quiz-open-rounds'] as const,
  /** Under the study's keys, so that ending a study session counts again. */
  counts: (today: number, ids: string) => [...studyKeys.all, 'home', today, ids] as const,
};

export const openRoundsQuery = (quiz: QuizRepository) =>
  queryOptions({
    queryKey: homeKeys.openRounds,
    queryFn: () => quiz.openRounds(),
    staleTime: 0,
    refetchOnMount: 'always',
  });

export const homeCountsQuery = (
  study: StudyRepository,
  today: number | null,
  prefs: StudyPreferences | undefined,
  base: HomeStudyBase | undefined,
  ids: string[],
) =>
  queryOptions({
    queryKey: homeKeys.counts(today ?? -1, ids.join(',')),
    queryFn: async () => {
      const until = new Date(dayStartsAt(today! + 1, prefs!.timeZone, prefs!.dayStartsAt) * 1000);
      const r = await study.homeCounts(ids, until, decayByDeck(base!, ids));
      return { truncated: r.truncated, decks: new Map(r.decks.map((d) => [d.deckId, d])) };
    },
    enabled: !!base && today !== null && ids.length > 0,
    staleTime: 30_000,
  });
