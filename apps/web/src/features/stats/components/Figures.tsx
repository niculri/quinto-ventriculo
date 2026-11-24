// The four figures under the heatmap (daily average, days studied, longest and current streak) and how much of the
// current streak (or of every day) was Anki and how much tests, or one line while nothing has been studied.

import type { HeatmapStats, StudySplit } from '@qv/study';
import { Skeleton } from '../../../shared/ui/Loading';
import { figureItems } from '../model/figures';
import { figuresStrings as s } from './strings/Figures.strings';

export function Figures({
  stats,
  split,
}: {
  stats: HeatmapStats | null;
  split: (StudySplit & { streak: boolean }) | null;
}) {
  const empty = stats !== null && stats.activeDays === 0;
  return (
    <div className="relative mt-3">
      <div className={empty ? 'invisible' : ''} aria-hidden={empty}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {figureItems(stats).map(([label, value]) => (
            <div key={label} className="h-11 min-w-0">
              <dt className="truncate text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 h-6 truncate text-base font-semibold tabular-nums">
                {stats ? value : <Skeleton className="h-5 w-20" />}
              </dd>
            </div>
          ))}
        </dl>
        {/* Always the same height (two lines on a phone), so the split arriving moves nothing. */}
        <p className="mt-2 line-clamp-2 h-8 text-xs leading-4 text-muted tabular-nums sm:line-clamp-1 sm:h-4">
          {split ? s.figures.split(split) : null}
        </p>
      </div>
      {empty ? (
        <p className="absolute inset-0 flex items-center text-sm text-muted">{s.figures.empty}</p>
      ) : null}
    </div>
  );
}
