// The groups and sections of the side menu of «Opciones».
import { Flag, Layers, SlidersHorizontal, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { paths } from '../../shared/lib/paths';
import { sectionsStrings as s } from './sections.strings';

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
    title: s.account,
    sections: [
      { label: s.user, to: paths.accountSettings, icon: UserRound },
      { label: s.reports, to: paths.myReports, icon: Flag },
    ],
  },
  {
    title: s.anki,
    sections: [
      { label: s.general, to: paths.ankiSettings, icon: Layers },
      {
        label: s.deckOptions,
        to: paths.deckOptions(),
        icon: SlidersHorizontal,
        fullAnkiOnly: true,
      },
    ],
  },
] as const satisfies readonly SettingsGroup[];
