// The cards failed in the last days, for «Falladas hace poco».

import { useQuery } from '@tanstack/react-query';
import { timingFor } from '@qv/study';
import type { StudyPreferences } from '@qv/schema/user';
import { useStudyRepository } from '../../progress/api/context';
import { FAILED_DAYS } from '../model/filters';
import { failedQuery } from '../api/queries';

export function useFailed(prefs: StudyPreferences | undefined, nowMs: number) {
  const study = useStudyRepository();
  const since = prefs ? timingFor(prefs, nowMs).nextDayAt - FAILED_DAYS * 86_400 : 0;
  return useQuery(failedQuery(study, since, !!prefs));
}
