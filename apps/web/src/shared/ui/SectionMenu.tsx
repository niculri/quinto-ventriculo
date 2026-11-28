// The own menu of a page with sections by group («Opciones», «Administración»): a column beside the page, tabs on top on
// the phone, and nothing on wide screens, where the site's menu has the same groups.
import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';

export interface MenuSection {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface MenuGroup {
  title: string;
  sections: readonly MenuSection[];
}

const link = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
    isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink'
  }`;

export function SectionMenu({ label, groups }: { label: string; groups: readonly MenuGroup[] }) {
  const id = useId();
  return (
    <nav aria-label={label} className="min-w-0 md:w-56 md:flex-none lg:hidden">
      <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 md:sticky md:top-24 md:mx-0 md:flex-col md:items-stretch md:gap-0 md:overflow-visible md:px-0 md:pb-0">
        {groups.map((group, i) => (
          <div
            key={group.title}
            role="group"
            aria-labelledby={`${id}-${String(i)}`}
            className="flex flex-none items-center gap-1 md:flex-col md:items-stretch md:gap-0.5"
          >
            <h2
              id={`${id}-${String(i)}`}
              className={`flex-none px-2 text-xs font-medium text-muted md:px-3 md:pb-1.5 md:text-sm ${
                i > 0 ? 'ml-2 md:mt-6 md:ml-0' : ''
              }`}
            >
              {group.title}
            </h2>
            <ul className="flex gap-1 md:flex-col md:gap-0.5">
              {group.sections.map(({ label: name, to, icon: Icon }) => (
                <li key={to} className="flex-none">
                  <NavLink to={to} className={link}>
                    <Icon className="size-4" aria-hidden="true" /> {name}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
