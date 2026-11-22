// «Hoy» on the home page: a row for each course with something on or answered, or a way to choose what to study.

import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { button, card } from '../../../shared/ui/styles';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useTodayCounts } from '../hooks/useTodayCounts';
import { todayStrings as s } from './strings/Today.strings';
import { DeckTodayRow } from './DeckTodayRow';
import { HashOrLink } from './HashOrLink';
import { TodayRow } from './TodayRow';

export function Today({ courses, choose }: { courses: CourseDeckNode[]; choose: string }) {
  const { study, results } = useTodayCounts(courses);
  return (
    <section className={`${card} mt-6 p-4 sm:mt-8 sm:p-6`} aria-labelledby="today">
      <h2 id="today" className="font-serif text-xl font-semibold">
        {s.today.title}
      </h2>
      {courses.length === 0 ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className="text-sm text-muted">{s.today.nothingOn}</p>
          <HashOrLink to={choose} className={`${button.base} ${button.primary}`}>
            {s.today.choose}
          </HashOrLink>
        </div>
      ) : study.error ? (
        <div className="mt-3">
          <ErrorWithRetry error={study.error} onRetry={study.retry} />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {courses.map((n) => {
            const r = results?.get(n.id);
            return r === undefined || !study.base ? (
              <TodayRow key={n.id} node={n} base={null} counts={null} mastery={null} />
            ) : r?.counts ? (
              <TodayRow
                key={n.id}
                node={n}
                base={study.base}
                counts={r.counts}
                mastery={r.mastery}
              />
            ) : (
              <DeckTodayRow key={n.id} node={n} base={study.base} />
            );
          })}
        </ul>
      )}
    </section>
  );
}
