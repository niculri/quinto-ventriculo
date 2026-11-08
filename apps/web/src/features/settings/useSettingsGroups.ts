import { useIsAdmin } from '../admin/queries';
import { usePreferences } from '../study/queries';
import { SETTINGS_GROUPS } from './sections';
import type { SettingsGroup } from './sections';

/**
 * The groups of «Opciones» this user sees: «Administración» only for an administrator, and what is of the full
 * Anki only with «Modo avanzado».
 */
export function useSettingsGroups(): readonly SettingsGroup[] {
  const isAdmin = useIsAdmin();
  const { prefs } = usePreferences();
  return SETTINGS_GROUPS.filter((g: SettingsGroup) => !g.adminOnly || isAdmin.data === true).map(
    (g: SettingsGroup) => ({
      ...g,
      sections: g.sections.filter((s) => !s.fullAnkiOnly || prefs?.fullAnki),
    }),
  );
}
