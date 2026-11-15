// The user's study preferences, with the browser's time zone, and saving them.
import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStudyRepository } from '../api/context';
import { preferencesQuery, studyKeys } from '../api/queries';
import { browserTimeZone, defaultPreferences } from '../api/repository';
import type { StudyPreferences } from '../api/repository';

/** The user's preferences; the time zone follows the browser's (Anki uses the computer's). */
export function usePreferences() {
  const study = useStudyRepository();
  const client = useQueryClient();
  const query = useQuery(preferencesQuery(study));
  const zone = browserTimeZone();
  const prefs = useMemo<StudyPreferences | undefined>(
    () =>
      query.data === undefined
        ? undefined
        : { ...(query.data ?? defaultPreferences(zone)), timeZone: zone },
    [query.data, zone],
  );
  // The stored zone is kept as the browser's: the statistics and other devices use it.
  const { mutate: saveZone } = useMutation({
    mutationFn: (next: StudyPreferences) => study.savePreferences(next),
    networkMode: 'always',
    onSuccess: (_, next) => client.setQueryData(studyKeys.preferences, next),
  });
  useEffect(() => {
    if (query.data === undefined || query.data?.timeZone === zone) return;
    saveZone({ ...(query.data ?? defaultPreferences(zone)), timeZone: zone });
  }, [query.data, saveZone, zone]);
  return { ...query, prefs };
}

export function useSavePreferences() {
  const study = useStudyRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (p: StudyPreferences) => study.savePreferences(p),
    onSuccess: (_, p) => {
      client.setQueryData(studyKeys.preferences, p);
      void client.invalidateQueries({ queryKey: studyKeys.allAnswers });
    },
  });
}
