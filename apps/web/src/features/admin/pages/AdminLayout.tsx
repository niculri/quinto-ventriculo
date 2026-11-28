// «Administración»: the menu of its sections by group and the open one, only for administrators.
import { Outlet } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { Loading } from '../../../shared/ui/Loading';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { SectionMenu } from '../../../shared/ui/SectionMenu';
import { page } from '../../../shared/ui/styles';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { ADMIN_GROUPS } from '../sections';
import { adminLayoutStrings as s } from './strings/AdminLayout.strings';

/** Stays mounted while the sections change, so the breadcrumbs, the title and the menu do not move. */
export function AdminLayout() {
  const isAdmin = useIsAdmin();
  if (isAdmin.isPending) return <Loading />;
  if (!isAdmin.data) return <NotFoundPage />;
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: s.layout.home, to: paths.home }, { label: s.layout.title }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.layout.title}</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
        <SectionMenu label={s.layout.sections} groups={ADMIN_GROUPS} />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
