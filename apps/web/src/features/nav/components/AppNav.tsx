// The menu of the whole app, on the left: Inicio, the semester, the course, its assessments and their notes, tests and
// decks. Only the path to the page open unfolds; in an assessment, its other parts are always there.
import { useMemo } from 'react';
import { CalendarDays, House } from 'lucide-react';
import { useLocation } from 'react-router';
import type { Catalog } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { catalogStrings } from '../../catalog/strings';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { buildAnkiTree } from '../../catalog/model/tree';
import type { AnkiTree } from '../../catalog/model/tree';
import { hasMaterial, locate } from '../model/where';
import type { Where } from '../model/where';
import { navStrings } from '../strings';
import { NavLink, icon } from './NavLink';
import { SemesterBranch } from './SemesterBranch';
import { AdminBranch, SettingsBranch } from './SectionBranches';

export function AppNav({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { pathname } = useLocation();
  const catalog = useCatalog();
  const data = catalog.data ?? null;
  const tree = useMemo(() => (data ? buildAnkiTree(data) : null), [data]);
  const where = useMemo(() => locate(pathname, data, tree), [pathname, data, tree]);
  return (
    <nav aria-label={navStrings.menu} className="text-[0.86rem] leading-snug">
      {/* What was opened or closed by hand is forgotten on going to another page. */}
      <NavTree
        key={pathname}
        where={where}
        catalog={data}
        tree={tree}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function NavTree({
  where,
  catalog,
  tree,
  pathname,
  onNavigate,
}: {
  where: Where;
  catalog: Catalog | null;
  tree: AnkiTree | null;
  pathname: string;
  onNavigate?: (() => void) | undefined;
}) {
  const semesters = (catalog?.semesters ?? []).filter((s) =>
    s.courses.some((c) => hasMaterial(c, tree)),
  );
  const semester = semesters.find((s) => s.number === where.semester) ?? null;
  const link = { onNavigate };
  return (
    <ul className="space-y-0.5">
      <li>
        <NavLink
          to={paths.home}
          active={pathname === paths.home}
          icon={<House className={icon} aria-hidden="true" />}
          {...link}
        >
          {navStrings.home}
        </NavLink>
      </li>
      {where.settings ? (
        <SettingsBranch pathname={pathname} onNavigate={onNavigate} />
      ) : where.admin ? (
        <AdminBranch pathname={pathname} onNavigate={onNavigate} />
      ) : semester ? (
        <SemesterBranch
          semester={semester}
          where={where}
          tree={tree}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ) : (
        <>
          {semesters.map((s) => (
            <li key={s.number}>
              <NavLink
                to={paths.semester(s.number)}
                active={false}
                icon={<CalendarDays className={icon} aria-hidden="true" />}
                {...link}
              >
                {s.name}
              </NavLink>
            </li>
          ))}
          {catalog?.hiddenSemesters ? (
            <li className="px-2.5 py-1.5 text-xs text-muted">{catalogStrings.moreSemestersSoon}</li>
          ) : null}
        </>
      )}
    </ul>
  );
}
