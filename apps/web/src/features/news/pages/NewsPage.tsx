// «Novedades»: every announcement the student may read, by day, with a filter by course. Opening it keeps them as seen;
// what was unread when it opened stays marked.
import { useEffect, useEffectEvent, useState } from 'react';
import { formatDate } from '../../../shared/lib/dates';
import { paths } from '../../../shared/lib/paths';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { Skeleton } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { Select } from '../../../shared/ui/Select';
import { card, page } from '../../../shared/ui/styles';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { NewsItem } from '../components/NewsItem';
import { useNews } from '../hooks/useNews';
import { byDay, isUnread, newsCourses, ofCourse } from '../model/news';
import { newsPageStrings as s } from './strings/NewsPage.strings';

export function NewsPage() {
  const news = useNews();
  const catalog = useCatalog();
  const [course, setCourse] = useState('all');
  // undefined until the list and what was read came: then what was read before this visit.
  const [openedWith, setOpenedWith] = useState<string | null | undefined>(undefined);
  if (news.ready && openedWith === undefined) setOpenedWith(news.seenUntil);
  const markSeen = useEffectEvent(() => news.markSeen());
  const opened = openedWith !== undefined;
  useEffect(() => {
    if (opened) markSeen();
  }, [opened]);

  const courses = newsCourses(news.announcements ?? [], catalog.data);
  const shown = ofCourse(news.announcements ?? [], course);
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: s.home, to: paths.home }, { label: s.title }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.title}</h1>
      <p className="mt-1 text-sm text-muted">{s.subtitle}</p>
      <div className="mt-5 flex">
        <Select
          label={s.course}
          value={course}
          options={[
            { value: 'all', label: s.allCourses },
            ...courses.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={setCourse}
          disabled={courses.length < 2}
          className="w-64 max-w-full"
        />
      </div>
      {news.feed.isError ? (
        <div className="mt-6">
          <ErrorWithRetry error={news.feed.error} onRetry={() => void news.feed.refetch()} />
        </div>
      ) : !news.announcements ? (
        <div aria-busy="true" className="mt-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : shown.length === 0 ? (
        <p className={`${card} mt-6 p-5 text-muted`}>
          {course === 'all' ? s.empty : s.emptyCourse}
        </p>
      ) : (
        byDay(shown).map(({ day, items }) => (
          <section key={day} aria-label={formatDate(items[0]!.publishedAt)} className="mt-6">
            <h2 className="text-sm font-semibold text-muted">
              {formatDate(items[0]!.publishedAt)}
            </h2>
            <ul className="mt-2 space-y-3">
              {items.map((a) => (
                <NewsItem
                  key={a.id}
                  announcement={a}
                  catalog={catalog.data}
                  unread={openedWith !== undefined && isUnread(a, openedWith)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
