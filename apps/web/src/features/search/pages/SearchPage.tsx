// The search page: every result for the `?q=` text, grouped by note.
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { page } from '../../../shared/ui/styles';
import { paths } from '../../../shared/lib/paths';
import { useApi } from '../../../shared/hooks/useApi';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { countSearch } from '../../usage/count';
import { useSearch } from '../hooks/useSearch';
import { groupByNote } from '../model/results';
import { SearchResults } from '../components/SearchResults';
import { searchStrings as s } from '../strings';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const text = params.get('q') ?? '';
  const search = useSearch(text, 50);
  const api = useApi();
  // Counted once, on Enter or on opening a result, never each text while typing.
  const complete = () => countSearch(api, text, 'search');
  const groups = groupByNote(search.results);
  const catalog = useCatalog().data;

  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: s.home, to: paths.home }, { label: s.title }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.title}</h1>
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
          placeholder={s.placeholder}
          aria-label={s.label}
          onKeyDown={(e) => {
            if (e.key === 'Enter') complete();
          }}
          className="h-12 w-full rounded-xl border border-border bg-surface pr-4 pl-11 text-base shadow-xs outline-none focus:border-brand focus-visible:outline-none"
        />
      </div>

      <div className="mt-8" aria-live="polite">
        <SearchResults search={search} groups={groups} catalog={catalog} onOpen={complete} />
      </div>
    </div>
  );
}
