// The sections of «Administración» by group, in order, for its own menu and the site's; `/admin` opens the first one.
import {
  ChartColumn,
  EyeOff,
  Flag,
  GitCompareArrows,
  Layers,
  Megaphone,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { paths } from '../../shared/lib/paths';
import type { MenuGroup } from '../../shared/ui/SectionMenu';
import { sectionsStrings as s } from './strings/sections.strings';

export const ADMIN_GROUPS = [
  {
    title: s.content,
    sections: [
      { label: s.releases, to: paths.adminReleases, icon: GitCompareArrows },
      { label: s.announcements, to: paths.adminAnnouncements, icon: Megaphone },
      { label: s.unpublished, to: paths.adminUnpublished, icon: EyeOff },
    ],
  },
  {
    title: s.students,
    sections: [
      { label: s.access, to: paths.adminAccess, icon: Users },
      { label: s.reports, to: paths.adminReports, icon: Flag },
    ],
  },
  {
    title: s.stats,
    sections: [
      { label: s.usage, to: paths.adminUsage, icon: ChartColumn },
      { label: s.cards, to: paths.adminCards, icon: Layers },
    ],
  },
  {
    title: s.site,
    sections: [{ label: s.settings, to: paths.adminSite, icon: SlidersHorizontal }],
  },
] as const satisfies readonly MenuGroup[];
