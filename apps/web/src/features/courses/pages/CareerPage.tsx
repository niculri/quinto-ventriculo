// «La carrera»: every semester, grouped by year, with its courses and how much material each has.
import { useTitle } from '../../../shared/hooks/useTitle';
import { paths } from '../../../shared/lib/paths';
import type { Catalog, SemesterWithCourses } from '@qv/schema';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { Skeleton } from '../../../shared/ui/Loading';
import { page } from '../../../shared/ui/styles';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { yearOfSemester } from '../../catalog/model/catalog';
import { careerPageStrings as s } from './strings/CareerPage.strings';
import { catalogStrings } from '../../../shared/strings/catalog.strings';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { SemesterCard } from '../components/SemesterCard';

export function CareerPage() {
  const catalog = useCatalog();
  useTitle(s.title);
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: s.home, to: paths.home }, { label: s.title }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.title}</h1>
      {catalog.isError ? (
        <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : !catalog.data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <Semesters catalog={catalog.data} />
      )}
    </div>
  );
}

function Semesters({ catalog }: { catalog: Catalog }) {
  const byYear = new Map<number, SemesterWithCourses[]>();
  for (const semester of catalog.semesters) {
    const y = yearOfSemester(semester.number);
    byYear.set(y, [...(byYear.get(y) ?? []), semester]);
  }
  return (
    <section className="mt-8" aria-label={s.semesters}>
      <div className="space-y-8">
        {[...byYear].map(([year, semesters]) => (
          <div key={year}>
            <h2 className="mb-3 font-serif text-xl font-semibold">
              {s.years[year - 1] ?? s.nthYear(year)}
              {s.year}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {semesters.map((semester) => (
                <li key={semester.number}>
                  <SemesterCard semester={semester} catalog={catalog} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {catalog.hiddenSemesters ? (
        <p className="mt-8 text-muted">{catalogStrings.moreSemestersSoon}</p>
      ) : null}
    </section>
  );
}
