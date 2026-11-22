// The four figures under the heatmap (daily average, days studied, longest and current streak), or one line while
// nothing has been studied.

import type { HeatmapStats } from '@qv/study';
import { Skeleton } from '../../../shared/ui/Loading';
import { figureItems } from '../model/figures';
import { figuresStrings as s } from './strings/Figures.strings';

export function Figures({ stats }: { stats: HeatmapStats | null }) {
  const empty = stats !== null && stats.activeDays === 0;
  return (
    <div className="relative mt-3">
      <dl
        className={`grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 ${empty ? 'invisible' : ''}`}
        aria-hidden={empty}
      >
        {figureItems(stats).map(([label, value]) => (
          <div key={label} className="h-11 min-w-0">
            <dt className="truncate text-xs text-muted">{label}</dt>
            <dd className="mt-0.5 h-6 truncate text-base font-semibold tabular-nums">
              {stats ? value : <Skeleton className="h-5 w-20" />}
            </dd>
          </div>
        ))}
      </dl>
      {empty ? (
        <p className="absolute inset-0 flex items-center text-sm text-muted">{s.figures.empty}</p>
      ) : null}
    </div>
  );
}
