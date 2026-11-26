// One announcement of «Novedades»: what it is, its text and the courses and assessments it is about, with their pages.
import type { Announcement, Catalog } from '@qv/schema';
import { Link } from 'react-router';
import { formatDateTime } from '../../../shared/lib/dates';
import { card } from '../../../shared/ui/styles';
import { newsLinks } from '../model/news';
import { newsItemStrings as s } from './strings/NewsItem.strings';

export function NewsItem({
  announcement: a,
  catalog,
  unread,
}: {
  announcement: Announcement;
  catalog: Catalog | undefined;
  unread: boolean;
}) {
  const links = newsLinks(a, catalog);
  return (
    <li className={`${card} p-4 sm:p-5`} data-news={a.id}>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="font-medium text-brand">{s.kind[a.kind]}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={a.publishedAt}>{formatDateTime(a.publishedAt)}</time>
        {unread ? (
          <span className="rounded-full bg-brand/10 px-1.5 font-medium text-brand">{s.isNew}</span>
        ) : null}
      </p>
      <h3 className="mt-1.5 font-semibold text-ink">{a.title}</h3>
      {a.body ? <p className="mt-1 text-sm whitespace-pre-line text-muted">{a.body}</p> : null}
      {links.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.key}>
              <Link
                to={l.to}
                className="inline-block rounded-full border border-border px-3 py-1 text-xs font-medium text-ink transition hover:border-border-strong hover:bg-surface-2"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
