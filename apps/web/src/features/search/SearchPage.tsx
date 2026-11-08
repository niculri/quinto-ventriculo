import { Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Notice, errorMessage } from '../../ui/Notice';
import { withContactLink } from '../../ui/ContactLink';
import { Skeleton } from '../../ui/Loading';
import { card, page } from '../../ui/styles';
import { paths } from '../../app/paths';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { Snippet } from './Snippet';
import { useCatalog } from '../catalog/queries';
import { groupByNote, resultLink, useSearch } from './useSearch';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const text = params.get('q') ?? '';
  const { results, active, isPending, isError, error, query } = useSearch(text, 50);
  const groups = groupByNote(results);
  const catalog = useCatalog().data;

  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: 'Inicio', to: paths.home }, { label: 'Buscar' }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Buscar</h1>
      <div className="relative mt-5">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          autoFocus
          value={text}
          onChange={(e) =>
            setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
          }
          placeholder="Busca en todos los apuntes"
          aria-label="Buscar en todos los apuntes"
          className="h-12 w-full rounded-xl border border-border bg-surface pr-4 pl-11 text-base shadow-xs outline-none focus:border-brand focus-visible:outline-none"
        />
      </div>

      <div className="mt-8" aria-live="polite">
        {!active ? (
          <p className="text-sm text-muted">
            Busca por concepto, estructura o proceso. No importan los acentos ni las mayúsculas, y
            basta con el comienzo de la palabra: «transcrip» encuentra «transcripción».
          </p>
        ) : isError ? (
          <Notice title="No se pudo buscar">{withContactLink(errorMessage(error))}</Notice>
        ) : isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted">Nada para «{query}».</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              {results.length} {results.length === 1 ? 'sección' : 'secciones'} en {groups.length}{' '}
              {groups.length === 1 ? 'apunte' : 'apuntes'}
            </p>
            <ol className="space-y-4">
              {groups.map((g) => (
                <li key={g.noteSlug} className={`${card} p-5`}>
                  <p className="text-xs font-medium tracking-wide text-muted uppercase">
                    {g.courseName}
                  </p>
                  <Link
                    to={resultLink({ ...g, anchor: '' }, catalog)}
                    className="font-serif text-lg font-semibold text-ink hover:text-brand"
                  >
                    {g.noteTitle}
                  </Link>
                  <ul className="mt-3 space-y-3 border-l border-border pl-4">
                    {g.sections.map((s) => (
                      <li key={s.anchor}>
                        <Link to={resultLink(s, catalog)} className="group block">
                          <span className="text-sm font-medium text-brand group-hover:underline">
                            {s.section}
                          </span>
                          <p className="mt-0.5 text-sm leading-relaxed text-muted">
                            <Snippet text={s.snippet} />
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
