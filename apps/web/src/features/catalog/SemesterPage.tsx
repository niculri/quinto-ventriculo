import { ArrowRight } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { paths } from '../../app/paths';
import { ErrorWithRetry } from '../../ui/Notice';
import { Loading } from '../../ui/Loading';
import { card, linkCard, page } from '../../ui/styles';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { countDecks, countNotes, materialLabel, useCatalog } from './queries';

export function SemesterPage() {
  const { number } = useParams();
  const catalog = useCatalog();
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  const semester = catalog.data.semesters.find((s) => String(s.number) === number);
  if (!semester) return <NotFoundPage />;

  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: 'Inicio', to: paths.home }, { label: semester.name }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{semester.name}</h1>
      {semester.courses.length === 0 ? (
        <p className="mt-6 text-muted">Todavía no hay ramos de este semestre.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {semester.courses.map((c) => {
            const n = countNotes(c);
            const decks = countDecks(catalog.data, c.id);
            const material = materialLabel(n, decks);
            const body = (
              <>
                <span className="text-3xl" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="mt-3 block text-lg font-semibold">{c.name}</span>
                <span className="mt-1 block text-sm text-muted">
                  {material
                    ? `${material} · ${c.assessments.map((a) => a.name).join(', ')}`
                    : 'Próximamente'}
                </span>
              </>
            );
            return (
              <li key={c.id}>
                {material ? (
                  <Link to={paths.course(c)} className={`${linkCard} group relative p-5`}>
                    {body}
                    <ArrowRight
                      className="absolute top-5 right-5 size-4 text-muted transition group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  <div className={`${card} p-5 opacity-60 shadow-none`}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
