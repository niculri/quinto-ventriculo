// The study heatmap of the home and course pages: a calendar year of days, its four figures and a day's box.

import { useId } from 'react';
import type { Catalog } from '@qv/schema';
import { card } from '../../../shared/ui/styles';
import { useHeatmap } from '../hooks/useHeatmap';
import { useHeatmapGroups } from '../hooks/useHeatmapGroups';
import type { GroupBy } from '../model/groups';
import { heatmapStrings as s } from './strings/Heatmap.strings';
import { Figures } from './Figures';
import { HeatmapGrid } from './HeatmapGrid';
import { YearNav } from './YearNav';

interface HeatmapProps {
  scope: string;
  deckIds: string[] | null;
  catalog: Catalog;
  groupBy: GroupBy;
  courseId?: string;
  className?: string;
}

export function Heatmap({
  scope,
  deckIds,
  catalog,
  groupBy,
  courseId,
  className = '',
}: HeatmapProps) {
  const headingId = useId();
  const { query, today, data, ready, studied, due, stats, range, thisYear, year, setChosen } =
    useHeatmap(scope, deckIds);
  const groups = useHeatmapGroups(catalog, groupBy, courseId);

  return (
    <section className={`${card} p-4 sm:p-6 ${className}`} aria-labelledby={headingId}>
      {/* One line of a fixed height: a web font arriving late cannot wrap the title and move the grid. */}
      <div className="flex h-9 items-center justify-between gap-2">
        <h2 id={headingId} className="min-w-0 truncate font-serif text-lg font-semibold sm:text-xl">
          {s.title}
        </h2>
        <YearNav year={year} thisYear={thisYear} range={range} onChoose={setChosen} />
      </div>
      <HeatmapGrid
        key={year}
        year={year}
        today={today}
        ready={ready}
        studied={studied}
        due={due}
        scale={stats?.scale ?? 20}
        data={data}
        groups={groups}
        error={query.isError && !data}
        onRetry={() => void query.refetch()}
      />
      <Figures stats={ready ? stats : null} />
    </section>
  );
}
