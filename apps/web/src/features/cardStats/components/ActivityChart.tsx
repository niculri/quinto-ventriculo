// The answers of the last 30 days and the cards due in the next 30, as bars on one scale: what was done in the site's
// turquoise, what is to come in grey.

import type { CardStatsData } from '@qv/study';
import { Skeleton } from '../../../shared/ui/Loading';
import { activityChart, CHART_DAYS } from '../model/chart';
import { DUE_BAR, PAST_BAR } from '../model/shades';
import { activityChartStrings as s } from './strings/ActivityChart.strings';

const WIDTH = 600;
const HEIGHT = 140;
const SLOT = WIDTH / (CHART_DAYS * 2);

export function ActivityChart({
  data,
}: {
  data: Pick<CardStatsData, 'days' | 'due' | 'today' | 'overdue'> | null;
}) {
  const chart = data ? activityChart(data) : null;
  const answered = chart?.bars.filter((b) => b.kind === 'past').reduce((t, b) => t + b.value, 0);
  const due = chart?.bars.filter((b) => b.kind === 'due').reduce((t, b) => t + b.value, 0);
  const dueToday = data?.due.find((d) => d.day === data.today)?.cards ?? 0;
  return (
    <div>
      <div className="flex h-5 items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ background: PAST_BAR }}
          />
          {s.legend.past}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ background: DUE_BAR }}
          />
          {s.legend.due}
        </span>
        <span className="ml-auto tabular-nums">{chart ? s.max(chart.max) : null}</span>
      </div>
      <div className="relative mt-2 h-36">
        {chart ? (
          <svg
            role="img"
            aria-label={s.summary(answered ?? 0, due ?? 0)}
            viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
            preserveAspectRatio="none"
            className="size-full"
          >
            <line x1="0" x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke="var(--border)" />
            <line
              x1={CHART_DAYS * SLOT}
              x2={CHART_DAYS * SLOT}
              y1="0"
              y2={HEIGHT}
              stroke="var(--border-strong)"
              strokeDasharray="3 3"
            />
            {chart.bars.map((b, i) =>
              b.value > 0 ? (
                <rect
                  key={b.offset}
                  x={i * SLOT + 1}
                  width={SLOT - 2}
                  y={HEIGHT - Math.max(2, b.height * HEIGHT)}
                  height={Math.max(2, b.height * HEIGHT)}
                  rx="1.5"
                  fill={b.kind === 'past' ? PAST_BAR : DUE_BAR}
                />
              ) : null,
            )}
          </svg>
        ) : (
          <Skeleton className="size-full" />
        )}
      </div>
      <div className="mt-1 grid grid-cols-3 text-xs text-muted">
        <span>{s.before}</span>
        <span className="text-center">{s.today}</span>
        <span className="text-right">{s.after}</span>
      </div>
      <p className="mt-2 h-5 text-sm tabular-nums">
        {data ? s.dueToday(dueToday, data.overdue) : null}
      </p>
    </div>
  );
}
