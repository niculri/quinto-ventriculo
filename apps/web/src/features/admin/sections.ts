import { EyeOff, Flag, GitCompareArrows, Globe, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { paths } from '../../app/paths';

export interface AdminSection {
  label: string;
  to: string;
  icon: LucideIcon;
}

/**
 * The sections of «Administración» (step 2.10), in order: its own menu (the page's, and the site's on wide screens).
 * `/admin` opens the first one. A new section is a page, its route (app/routes.tsx) and a line here; a section
 * without anything yet does not go in the menu.
 */
export const ADMIN_SECTIONS = [
  { label: 'Publicaciones', to: paths.adminReleases, icon: GitCompareArrows },
  { label: 'Reportes', to: paths.adminReports, icon: Flag },
  { label: 'Acceso', to: paths.adminAccess, icon: Users },
  { label: 'Sitio', to: paths.adminSite, icon: Globe },
  { label: 'Fuera del sitio', to: paths.adminUnpublished, icon: EyeOff },
] as const satisfies readonly AdminSection[];
