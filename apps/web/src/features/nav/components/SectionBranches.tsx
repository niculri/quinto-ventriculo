// The site's menu on the administration and «Opciones» pages: their sections, by group, always open.
import { useId } from 'react';
import type { ReactNode } from 'react';
import { Settings, ShieldCheck } from 'lucide-react';
import type { MenuGroup } from '../../../shared/ui/SectionMenu';
import { useSettingsGroups } from '../../settings/hooks/useSettingsGroups';
import { ADMIN_GROUPS, useIsAdmin } from '../../admin';
import { sectionBranchesStrings } from './strings/SectionBranches.strings';
import { NavLink, icon, row } from './NavLink';

interface BranchProps {
  pathname: string;
  onNavigate?: (() => void) | undefined;
}

function GroupedBranch({
  title,
  titleIcon,
  groups,
  pathname,
  onNavigate,
}: BranchProps & { title: string; titleIcon: ReactNode; groups: readonly MenuGroup[] }) {
  const id = useId();
  return (
    <li>
      <p className={`${row} font-medium text-ink`}>
        {titleIcon} {title}
      </p>
      {groups.map((g, i) => (
        <div key={g.title} role="group" aria-labelledby={`${id}-${String(i)}`}>
          <p
            id={`${id}-${String(i)}`}
            className="mt-3 px-2.5 py-1 text-xs font-semibold tracking-wide text-muted uppercase"
          >
            {g.title}
          </p>
          <ul className="space-y-0.5">
            {g.sections.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  active={pathname === to}
                  icon={<Icon className={icon} aria-hidden="true" />}
                  onNavigate={onNavigate}
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </li>
  );
}

export function AdminBranch(props: BranchProps) {
  const isAdmin = useIsAdmin();
  if (isAdmin.data !== true) return null;
  return (
    <GroupedBranch
      {...props}
      title={sectionBranchesStrings.admin}
      titleIcon={<ShieldCheck className={icon} aria-hidden="true" />}
      groups={ADMIN_GROUPS}
    />
  );
}

export function SettingsBranch(props: BranchProps) {
  const groups = useSettingsGroups();
  return (
    <GroupedBranch
      {...props}
      title={sectionBranchesStrings.settings}
      titleIcon={<Settings className={icon} aria-hidden="true" />}
      groups={groups}
    />
  );
}
