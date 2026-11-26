// The line of «Novedades» on the home page: one line of fixed height, always there, with the newest unread announcement,
// «No hay novedades» or that they could not be read, and a link to all of them.
import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import { useNews } from '../hooks/useNews';
import { newsLineStrings as s } from './strings/NewsLine.strings';

export function NewsLine() {
  const news = useNews();
  const { unread } = news;
  const newest = unread[0];
  return (
    <Link
      to={paths.news}
      className="mt-6 flex h-12 min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-4 text-sm shadow-soft transition hover:border-border-strong sm:mt-8"
    >
      <Bell
        className={`size-4 flex-none ${newest ? 'text-brand' : 'text-muted'}`}
        aria-hidden="true"
      />
      <span className="sr-only">{s.label}:</span>{' '}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {!news.ready && !news.feed.isError ? (
          <Skeleton className="h-4 w-48 max-w-full" />
        ) : news.feed.isError ? (
          <span className="truncate text-muted">{s.failed}</span>
        ) : newest ? (
          <>
            <span className="flex-none font-semibold text-brand">{s.isNew}</span>{' '}
            <span className="min-w-0 truncate text-ink">{newest.title}</span>{' '}
            {unread.length > 1 ? (
              <span className="flex-none text-muted max-sm:hidden">
                {s.more(unread.length - 1)}
              </span>
            ) : null}
          </>
        ) : (
          <span className="truncate text-muted">{s.upToDate}</span>
        )}
      </span>{' '}
      <span className="flex-none font-medium text-brand max-sm:hidden">{s.see}</span>
    </Link>
  );
}
