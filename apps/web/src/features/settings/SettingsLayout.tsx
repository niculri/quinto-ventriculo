import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { paths } from '../../app/paths';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { useSettingsGroups } from './useSettingsGroups';
import { page } from '../../ui/styles';

/**
 * «Opciones»: the menu of its sections on the left, by group (on top, as tabs, on the phone), and the open
 * one on the right. On wide screens the site's menu (ui/AppNav.tsx) has them, so this one goes away.
 */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const groups = useSettingsGroups();
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: 'Inicio', to: paths.home }, { label: 'Opciones' }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Opciones</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
        <nav
          aria-label="Secciones de las opciones"
          className="min-w-0 md:w-56 md:flex-none lg:hidden"
        >
          {/* Each group: its title (a heading, not a link) and its sections. On the phone everything goes in one
              row that scrolls by itself if it does not fit, never the page. */}
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
