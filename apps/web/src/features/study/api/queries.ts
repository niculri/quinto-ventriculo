// What the study screens read beyond the user's progress: the summary of «Listo por hoy», read again on every visit.
import { queryOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { dayStartsAt } from '@qv/srs';
import { daySummary, timingFor } from '@qv/study';
import { ancestry, descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import type { StudyPreferences, StudyRepository } from '../../progress/api/repository';
import { studyKeys } from '../../progress/queries';
import { heatmapKeys } from '../../stats/api/queries';

const studyScreenKeys = {
  daySummary: (deckId: string, visit: number) =>
    [...studyKeys.all, 'day-summary', deckId, visit] as const,
};

export function daySummaryQuery({
  study,
  client,
  node,
  prefs,
  saved,
  visit,
}: {
  study: StudyRepository;
  client: QueryClient;
  node: CourseDeckNode;
  prefs: StudyPreferences;
  saved: () => Promise<unknown>;
  visit: number;
}) {
  return queryOptions({
    queryKey: studyScreenKeys.daySummary(node.id, visit),
    queryFn: async () => {
      // A failed save stops the session and says so: the summary shows what the database has.
      await saved().catch(() => undefined);
      const { today } = timingFor(prefs);
      const from = new Date(dayStartsAt(today, prefs.timeZone, prefs.dayStartsAt) * 1000);
      const to = new Date(dayStartsAt(today + 1, prefs.timeZone, prefs.dayStartsAt) * 1000);
      const [answers, heat] = await Promise.all([
        study.ratedBetween(from, to),
        // The home page's own reading, read again: it already has today's answers.
        client.query({
          queryKey: heatmapKeys.scope('all'),
          queryFn: () => study.heatmap(null),
          staleTime: 0,
        }),
      ]);
      const decks = new Set(descendants(node).map((n) => n.id));
      const course = ancestry(node).find((n) => n.depth === 2) ?? null;
      const courseDecks = course ? new Set(descendants(course).map((n) => n.id)) : null;
      return { today, summary: daySummary(answers, decks, heat, today, courseDecks) };
    },
    gcTime: 0,
    staleTime: Infinity,
  });
}
