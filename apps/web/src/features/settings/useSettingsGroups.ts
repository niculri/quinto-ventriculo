import { usePreferences } from '../study/queries';
import { SETTINGS_GROUPS } from './sections';
import type { SettingsGroup } from './sections';

/** The groups of «Opciones» this user sees: what is of the full Anki only with «Modo avanzado». */
export function useSettingsGroups(): readonly SettingsGroup[] {
  const { prefs } = usePreferences();
  return SETTINGS_GROUPS.map((g: SettingsGroup) => ({
    ...g,
    sections: g.sections.filter((s) => !s.fullAnkiOnly || prefs?.fullAnki),
  }));
}
