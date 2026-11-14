// The groups and sections of the side menu of «Opciones».
import { Flag, Layers, SlidersHorizontal, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { paths } from '../../shared/lib/paths';

interface SettingsSection {
  label: string;
  to: string;
  icon: LucideIcon;
  fullAnkiOnly?: boolean;
}

export interface SettingsGroup {
  title: string;
  sections: readonly SettingsSection[];
}

/** `/settings` opens the first section. */
export const SETTINGS_GROUPS = [
  {
    title: 'Cuenta',
    sections: [
      { label: 'Datos de usuario', to: paths.accountSettings, icon: UserRound },
      { label: 'Mis reportes', to: paths.myReports, icon: Flag },
    ],
  },
  {
    title: 'Anki',
    sections: [
      { label: 'General', to: paths.ankiSettings, icon: Layers },
      {
        label: 'Configuración de mazos',
        to: paths.deckOptions(),
        icon: SlidersHorizontal,
        fullAnkiOnly: true,
      },
    ],
  },
] as const satisfies readonly SettingsGroup[];
