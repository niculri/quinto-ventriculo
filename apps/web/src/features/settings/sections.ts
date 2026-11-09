import { Flag, Layers, SlidersHorizontal, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { paths } from '../../app/paths';

export interface SettingsSection {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Only with «Modo avanzado». */
  fullAnkiOnly?: boolean;
}

export interface SettingsGroup {
  /** Shown above its sections in the side menu: a heading, not a link. */
  title: string;
  sections: readonly SettingsSection[];
}

/**
 * The side menu of «Opciones»: its groups, each with a title and its sections, in order. `/settings` opens the
 * first section; a new section is a page, its route (app/routes.tsx) and a line here. Only the account and Anki:
 * what is of the administrators has its own page since step 2.10 (features/admin/sections.ts).
 */
export const SETTINGS_GROUPS = [
  {
    title: 'Cuenta',
    sections: [
      { label: 'Datos de usuario', to: paths.accountSettings, icon: UserRound },
      // Step 2.6: what the student reported and what happened.
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
