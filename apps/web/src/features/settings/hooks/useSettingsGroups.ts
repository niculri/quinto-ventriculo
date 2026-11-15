// The groups of «Opciones» this user sees: the advanced Anki sections only with «Modo avanzado».
import { usePreferences } from '../../progress/hooks/useStudy';
import { SETTINGS_GROUPS } from '../sections';
import type { SettingsGroup } from '../sections';

export function useSettingsGroups(): readonly SettingsGroup[] {
  const { prefs } = usePreferences();
  return SETTINGS_GROUPS.map((g: SettingsGroup) => ({
    ...g,
    sections: g.sections.filter((s) => !s.fullAnkiOnly || prefs?.fullAnki),
  }));
}
