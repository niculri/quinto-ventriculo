import { ArrowRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../../app/paths';
import type { Catalog, SemesterWithCourses } from '@qv/schema';
import { ErrorWithRetry } from '../../ui/Notice';
import { Skeleton } from '../../ui/Loading';
import { card, linkCard, page } from '../../ui/styles';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import {
  MORE_SEMESTERS_SOON,
  countDecks,
  countNotes,
  materialLabel,
  useCatalog,
  yearOfSemester,
} from './queries';

const YEARS = ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo'];

/**
 * «La carrera» (step 3.2): every semester and its courses, as the home page showed them before. The home page has only
 * what is the student's, and a line to here.
 */
export function CareerPage() {
  const catalog = useCatalog();
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: 'Inicio', to: paths.home }, { label: 'La carrera' }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">La carrera</h1>
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
  for (const s of catalog.semesters) {
    const y = yearOfSemester(s.number);
    byYear.set(y, [...(byYear.get(y) ?? []), s]);
  }
  return (
    <section className="mt-8" aria-label="Semestres">
      <div className="space-y-8">
        {[...byYear].map(([year, semesters]) => (
          <div key={year}>
            {/* h2: under the page's h1 (in the home page it was under «La carrera», an h2; review of 3.2). */}
            <h2 className="mb-3 font-serif text-xl font-semibold">
              {YEARS[year - 1] ?? `${year}.º`} año
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {semesters.map((s) => (
                <li key={s.number}>
                  <SemesterCard semester={s} catalog={catalog} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* The semesters without material, when the site hides them: one line in their place. */}
      {catalog.hiddenSemesters ? <p className="mt-8 text-muted">{MORE_SEMESTERS_SOON}</p> : null}
    </section>
  );
}

function SemesterCard({ semester, catalog }: { semester: SemesterWithCourses; catalog: Catalog }) {
  const notes = semester.courses.reduce((t, c) => t + countNotes(c), 0);
  const decks = semester.courses.reduce((t, c) => t + countDecks(catalog, c.id), 0);
  if (!semester.courses.length) {
    return (
      <div className={`${card} border-dashed p-5 opacity-70 shadow-none`}>
        <p className="font-semibold">{semester.name}</p>
        <p className="mt-1 text-sm text-muted">Pronto.</p>
      </div>
    );
  }
  return (
    <Link to={paths.semester(semester.number)} className={`${linkCard} group p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{semester.name}</p>
        <ArrowRight
          className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink"
          aria-hidden="true"
        />
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {semester.courses.map((c) => (
          <li key={c.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
            {c.emoji} {c.name}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <BookOpen className="size-3.5" aria-hidden="true" />
        {materialLabel(notes, decks) || 'Apuntes en camino'}
      </p>
    </Link>
  );
}
