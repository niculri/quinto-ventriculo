// The site's menu on the administration and «Opciones» pages: their sections, by group in «Opciones».
import { Settings, ShieldCheck } from 'lucide-react';
import { useSettingsGroups } from '../../settings/hooks/useSettingsGroups';
import { ADMIN_SECTIONS, useIsAdmin } from '../../admin';
import { navStrings } from '../strings';
import { NavLink, icon, row } from './NavLink';

export function AdminBranch({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const isAdmin = useIsAdmin();
  if (isAdmin.data !== true) return null;
  return (
    <li>
      <p className={`${row} font-medium text-ink`}>
        <ShieldCheck className={icon} aria-hidden="true" /> {navStrings.admin}
      </p>
      <ul className="mt-1 space-y-0.5">
        {ADMIN_SECTIONS.map(({ label, to, icon: Icon }) => (
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
    </li>
  );
}

export function SettingsBranch({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const groups = useSettingsGroups();
  return (
    <li>
      <p className={`${row} font-medium text-ink`}>
        <Settings className={icon} aria-hidden="true" /> {navStrings.settings}
      </p>
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mt-3 px-2.5 py-1 text-xs font-semibold tracking-wide text-muted uppercase">
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
