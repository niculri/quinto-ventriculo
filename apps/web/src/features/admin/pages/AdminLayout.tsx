// «Administración»: the menu of its sections and the open one, only for administrators.
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { Loading } from '../../../shared/ui/Loading';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { page } from '../../../shared/ui/styles';
import { useIsAdmin } from '../queries';
import { ADMIN_SECTIONS } from '../sections';
import { useTitle } from '../../../shared/hooks/useTitle';

/** Stays mounted while the sections change, so the breadcrumbs, the title and the menu do not move. */
export function AdminLayout() {
  const isAdmin = useIsAdmin();
  if (isAdmin.isPending) return <Loading />;
  if (!isAdmin.data) return <NotFoundPage />;
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: 'Inicio', to: paths.home }, { label: 'Administración' }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Administración</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
        <nav
          aria-label="Secciones de la administración"
          className="min-w-0 md:w-56 md:flex-none lg:hidden"
        >
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:sticky md:top-24 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0">
            {ADMIN_SECTIONS.map(({ label, to, icon: Icon }) => (
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
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

/** A section's title (the page's second level) and the tab's title while it is open. */
export function AdminSectionTitle({ title, children }: { title: string; children?: ReactNode }) {
  useTitle(title);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      {children}
    </div>
  );
}
