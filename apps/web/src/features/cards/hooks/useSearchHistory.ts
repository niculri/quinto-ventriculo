// The answers a search by date (`rated:`, `introduced:`) needs, read from the day it counts from.

import { useQuery } from '@tanstack/react-query';
import { searchNeeds } from '@qv/anki-search';
import type { SearchNode } from '@qv/anki-search';
import { useStudyRepository } from '../../progress/api/context';
import { introducedQuery, ratedQuery } from '../api/queries';

export function useSearchHistory(node: SearchNode | null, nextDayAt: number | null) {
  const study = useStudyRepository();
  const needs = node ? searchNeeds(node) : { ratedDays: null, introducedDays: null };
  const ratedSince =
    needs.ratedDays === null || nextDayAt === null ? null : nextDayAt - needs.ratedDays * 86_400;
  const introducedSince =
    needs.introducedDays === null || nextDayAt === null
      ? null
      : nextDayAt - needs.introducedDays * 86_400;
  const rated = useQuery(ratedQuery(study, ratedSince));
  const introduced = useQuery(introducedQuery(study, introducedSince));
  const waiting =
    (ratedSince !== null && !rated.data) || (introducedSince !== null && !introduced.data);
  return { rated: rated.data, introduced: introduced.data, waiting };
}
