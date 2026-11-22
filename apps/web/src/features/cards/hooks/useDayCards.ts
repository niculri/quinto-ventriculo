// The cards of the heatmap day in the URL (`day=AAAA-MM-DD`), with what reading them needs.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dayNumber, timingFor } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import type { CardsScope } from '../../catalog/model/scope';
import type { CardsData } from '../model/cardsData';
import { dayCardsOf } from '../model/dayCards';
import { dayAnswersQuery, heatmapQuery } from '../api/queries';

export function useDayCards(
  scope: CardsScope | null,
  data: CardsData | undefined,
  dayParam: string | null,
) {
  const study = useStudyRepository();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayNumber(dayParam) : null;
  const prefs = data?.prefs;
  const today = prefs ? timingFor(prefs).today : null;
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
  // By hand: the compiler leaves it without a cache.
  const value = useMemo(
    () =>
      dayCardsOf({
        day,
        today,
        data,
        answered: answered.data,
        heat: heat.data,
        deckIds: scope?.deckIds ?? [],
      }),
    [day, data, today, answered.data, heat.data, scope],
  );
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
