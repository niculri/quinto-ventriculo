// The sections of «Administración», in order, for its own menu and the site's; `/admin` opens the first one.
import {
  ChartColumn,
  EyeOff,
  Flag,
  GitCompareArrows,
  Globe,
  Layers,
  Megaphone,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { paths } from '../../shared/lib/paths';
import { sectionsStrings as s } from './strings/sections.strings';

export interface AdminSection {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const ADMIN_SECTIONS = [
  { label: s.releases, to: paths.adminReleases, icon: GitCompareArrows },
  { label: s.announcements, to: paths.adminAnnouncements, icon: Megaphone },
  { label: s.reports, to: paths.adminReports, icon: Flag },
  { label: s.usage, to: paths.adminUsage, icon: ChartColumn },
  { label: s.cards, to: paths.adminCards, icon: Layers },
  { label: s.access, to: paths.adminAccess, icon: Users },
  { label: s.site, to: paths.adminSite, icon: Globe },
  { label: s.unpublished, to: paths.adminUnpublished, icon: EyeOff },
] as const satisfies readonly AdminSection[];
