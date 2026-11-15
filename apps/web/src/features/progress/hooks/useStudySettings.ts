// The user's presets and the configuration chosen for each deck.
import { useQuery } from '@tanstack/react-query';
import { useStudyRepository } from '../api/context';
import { deckSettingsQuery, userPresetsQuery } from '../api/queries';

export function useUserPresets() {
  const study = useStudyRepository();
  return useQuery(userPresetsQuery(study));
}

export function useDeckSettings() {
  const study = useStudyRepository();
  return useQuery(deckSettingsQuery(study));
}
