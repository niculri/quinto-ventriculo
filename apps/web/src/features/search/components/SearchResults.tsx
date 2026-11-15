// The search page's results: how to search, an error, loading, «nothing for», or each note with its sections.
import { Link } from 'react-router';
import type { Catalog } from '@qv/schema';
import { Notice, errorMessage } from '../../../shared/ui/Notice';
import { withContactLink } from '../../../shared/ui/ContactLink';
import { Skeleton } from '../../../shared/ui/Loading';
import { card } from '../../../shared/ui/styles';
import { paths } from '../../../shared/lib/paths';
import type { useSearch } from '../hooks/useSearch';
import { resultLink } from '../model/results';
import type { ResultGroup } from '../model/results';
import { Snippet } from './Snippet';
import { searchStrings as s } from '../strings';

export function SearchResults({
  search: { results, active, isPending, isError, error, query },
  groups,
  catalog,
  onOpen,
}: {
  search: ReturnType<typeof useSearch>;
  groups: ResultGroup[];
  catalog: Catalog | undefined;
  onOpen: () => void;
}) {
  if (!active) return <p className="text-sm text-muted">{s.howTo}</p>;
  if (isError) return <Notice title={s.failed}>{withContactLink(errorMessage(error))}</Notice>;
  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="text-sm text-muted">
        <p>
          {s.nothingFor}
          {query}
          {s.nothingAfter}
        </p>
        <p className="mt-3">
          <Link to={paths.courses} className="font-medium text-brand hover:underline">
            {s.career}
          </Link>
        </p>
      </div>
    );
  }
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        {results.length} {s.sections(results.length)}
        {s.in}
        {groups.length} {s.notes(groups.length)}
      </p>
      <ol className="space-y-4">
        {groups.map((g) => (
          <li key={g.noteSlug} className={`${card} p-5`}>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{g.courseName}</p>
            <Link
              to={resultLink({ ...g, anchor: '' }, catalog)}
              onClick={onOpen}
              className="font-serif text-lg font-semibold text-ink hover:text-brand"
            >
              {g.noteTitle}
            </Link>
            <ul className="mt-3 space-y-3 border-l border-border pl-4">
              {g.sections.map((section) => (
                <li key={section.anchor}>
                  <Link to={resultLink(section, catalog)} onClick={onOpen} className="group block">
                    <span className="text-sm font-medium text-brand group-hover:underline">
                      {section.section}
                    </span>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">
                      <Snippet text={section.snippet} />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}
