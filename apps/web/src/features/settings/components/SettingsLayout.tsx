// The frame of «Opciones»: the menu of its sections by group (tabs on top on the phone) and the open section.
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { useSettingsGroups } from '../hooks/useSettingsGroups';
import { page } from '../../../shared/ui/styles';
import { settingsLayoutStrings as s } from './strings/SettingsLayout.strings';

/** On wide screens the site's menu (features/nav/components/AppNav.tsx) has the sections, so this one goes away. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const groups = useSettingsGroups();
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: s.home, to: paths.home }, { label: s.title }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.title}</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
        <nav aria-label={s.sections} className="min-w-0 md:w-56 md:flex-none lg:hidden">
          <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 md:sticky md:top-24 md:mx-0 md:flex-col md:items-stretch md:gap-0 md:overflow-visible md:px-0 md:pb-0">
            {groups.map((group, i) => (
              <div
                key={group.title}
                role="group"
                aria-labelledby={`settings-group-${i}`}
                className="flex flex-none items-center gap-1 md:flex-col md:items-stretch md:gap-0.5"
              >
                <h2
                  id={`settings-group-${i}`}
                  className={`flex-none px-2 text-xs font-medium text-muted md:px-3 md:pb-1.5 md:text-sm ${
                    i > 0 ? 'ml-2 md:mt-6 md:ml-0' : ''
                  }`}
                >
                  {group.title}
                </h2>
                <ul className="flex gap-1 md:flex-col md:gap-0.5">
                  {group.sections.map(({ label, to, icon: Icon }) => (
                    <li key={to} className="flex-none">
                      <NavLink
                        to={to}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                            isActive
                              ? 'bg-brand-soft text-brand'
                              : 'text-muted hover:bg-surface-2 hover:text-ink'
                          }`
                        }
                      >
                        <Icon className="size-4" aria-hidden="true" /> {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
