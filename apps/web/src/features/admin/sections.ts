// The sections of «Administración», in order, for its own menu and the site's; `/admin` opens the first one.
import { ChartColumn, EyeOff, Flag, GitCompareArrows, Globe, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { paths } from '../../shared/lib/paths';

export interface AdminSection {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const ADMIN_SECTIONS = [
  { label: 'Publicaciones', to: paths.adminReleases, icon: GitCompareArrows },
  { label: 'Reportes', to: paths.adminReports, icon: Flag },
  { label: 'Uso', to: paths.adminUsage, icon: ChartColumn },
  { label: 'Acceso', to: paths.adminAccess, icon: Users },
  { label: 'Sitio', to: paths.adminSite, icon: Globe },
  { label: 'Fuera del sitio', to: paths.adminUnpublished, icon: EyeOff },
] as const satisfies readonly AdminSection[];
