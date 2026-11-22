// The cards of the heatmap day in the URL (`day=AAAA-MM-DD`), with what reading them needs.

import { useQuery } from '@tanstack/react-query';
import { dayNumber, timingFor } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import type { StudyPreferences } from '../../progress/api/repository';
import type { CardsScope } from '../../catalog/model/scope';
import type { CardsData } from '../model/cardsData';
import { dayCardsOf } from '../model/dayCards';
import { dayAnswersQuery, heatmapQuery } from '../api/queries';

/** The day's answers and the heatmap, read once the day is a past one. */
function useDayReads(
  scope: CardsScope | null,
  prefs: StudyPreferences | undefined,
  dayParam: string | null,
  day: number | null,
  today: number | null,
) {
  const study = useStudyRepository();
  const past = day !== null && today !== null && day <= today;
  const heat = useQuery(heatmapQuery(study, past));
  const answered = useQuery(
    dayAnswersQuery({
      study,
      scopeId: scope?.node.id ?? '',
      dayParam: dayParam ?? '',
      day,
      prefs,
      enabled: past && !!prefs,
    }),
  );
  return { heat, answered };
}

export function useDayCards(
  scope: CardsScope | null,
  data: CardsData | undefined,
  dayParam: string | null,
) {
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayNumber(dayParam) : null;
  const prefs = data?.prefs;
  const today = prefs ? timingFor(prefs).today : null;
  // Hooks first: what they take is not changed afterwards, and the compiler can keep what is built from it.
  const { heat, answered } = useDayReads(scope, prefs, dayParam, day, today);
  const answeredData = answered.data;
  const heatData = heat.data;
  const value = dayCardsOf({
    day,
    today,
    data,
    answered: answeredData,
    heat: heatData,
    deckIds: scope?.deckIds ?? [],
  });
  const error = answered.error ?? heat.error;
  return {
    day,
    value,
    error,
    retry: () => {
      if (answered.isError) void answered.refetch();
      if (heat.isError) void heat.refetch();
    },
    waiting: day !== null && !value && !error,
  };
}
