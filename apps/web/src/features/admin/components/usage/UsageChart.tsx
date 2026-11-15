// The chart of «Uso»: one figure by day (or by week, except the opens, kept by day only), with its first and last day
// and its maximum.
import { useState } from 'react';
import { FEW } from '@qv/schema';
import type { UsageReport } from '@qv/schema';
import { Reserved } from '../../../../shared/ui/Reserved';
import { Select } from '../../../../shared/ui/Select';
import { card } from '../../../../shared/ui/styles';
import {
  NUMBER,
  OPEN_ROWS,
  ROWS,
  barHeight,
  chartPoints,
  figure,
  isOpenKey,
  shortDay,
} from '../../model/usage';
import type { Metric, Period } from '../../model/usage';
import { usageStrings } from '../../usage.strings';

const s = usageStrings.chart;

export function UsageChart({ report }: { report: UsageReport | null }) {
  const [metric, setMetric] = useState<Metric>('activeStudents');
  const [period, setPeriod] = useState<Period>('day');
  const opens = report?.opens ?? null;
  const metrics = [
    ...ROWS.map((r) => ({ value: r.key as Metric, label: r.label })),
    ...(opens ? OPEN_ROWS.map((r) => ({ value: r.key as Metric, label: r.label })) : []),
  ];
  const byWeek = period === 'week' && !isOpenKey(metric);
  const students = ROWS.find((r) => r.key === metric)?.students ?? false;
  const points = chartPoints(report, metric, byWeek);
  const max = Math.max(1, ...points.map((p) => (p.value === FEW ? 0 : p.value)));
  const name = metrics.find((m) => m.value === metric)?.label ?? '';
  const label = (day: string, value: string) =>
    `${byWeek ? s.weekOf : ''}${s.point(shortDay(day), value)}`;
  return (
    <section aria-labelledby="usage-chart" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="usage-chart" className="text-lg font-semibold">
          {byWeek ? s.byWeek : s.byDay}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Select
            label={s.figure}
            value={metric}
            options={metrics}
            onChange={setMetric}
            disabled={!report}
            className="w-60"
          />
          <Select
            label={s.period}
            value={isOpenKey(metric) ? 'day' : period}
            options={[
              { value: 'day', label: s.days },
              { value: 'week', label: s.weeks },
            ]}
            onChange={setPeriod}
            disabled={!report || isOpenKey(metric)}
            className="w-48"
          />
        </div>
      </div>
      <div className={`${card} mt-3 px-4 pt-4 pb-3 sm:px-5`}>
        <ol aria-label={s.label(name, byWeek)} className="flex h-40 items-end gap-[2px] sm:gap-1">
          {points.length
            ? points.map((p) => (
                <li
                  key={p.label}
                  className="flex h-full min-w-0 flex-1 items-end"
                  title={label(p.label, figure(p.value, students))}
                >
                  <span className="sr-only">{label(p.label, figure(p.value, students))}</span>
                  <span
                    aria-hidden="true"
                    className={`block w-full rounded-t-sm ${p.value === FEW ? 'bg-border-strong' : 'bg-brand'}`}
                    style={{ height: barHeight(p.value, max) }}
                  />
                </li>
              ))
            : null}
        </ol>
        <div className="mt-2 flex justify-between text-xs text-muted tabular-nums">
          <Reserved longest={s.longestDay} className="text-left">
            <span>{points[0] ? shortDay(points[0].label) : ''}</span>
          </Reserved>
          <Reserved longest={s.max(NUMBER.format(100000))} className="text-center">
            <span>{points.length ? s.max(NUMBER.format(max)) : ''}</span>
          </Reserved>
          <Reserved longest={s.longestDay} className="text-right">
            <span>{points.at(-1) ? shortDay(points.at(-1)!.label) : ''}</span>
          </Reserved>
        </div>
      </div>
    </section>
  );
}
