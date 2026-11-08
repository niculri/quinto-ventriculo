import { GitCompareArrows, Layers, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
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
  /** Only administrators see it (features/admin). */
  adminOnly?: boolean;
  sections: readonly SettingsSection[];
}

/**
 * The side menu of «Opciones»: its groups, each with a title and its sections, in order. `/settings` opens the
 * first section; a new section is a page, its route (app/routes.tsx) and a line here.
 */
export const SETTINGS_GROUPS = [
  {
    title: 'Cuenta',
    sections: [{ label: 'Datos de usuario', to: paths.accountSettings, icon: UserRound }],
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
  {
    title: 'Administración',
    adminOnly: true,
    sections: [
      { label: 'Panel de administración', to: paths.admin, icon: ShieldCheck },
      { label: 'Publicaciones', to: paths.adminReleases, icon: GitCompareArrows },
    ],
  },
] as const satisfies readonly SettingsGroup[];
