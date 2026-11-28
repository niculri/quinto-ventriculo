// The chart of «Uso»: one figure by day (or by week, except the opens, kept by day only), with an axis of round marks,
// its first and last day, and the data of each column in a box.
import { useState } from 'react';
import { FEW } from '@qv/schema';
import type { UsageReport } from '@qv/schema';
import { Reserved } from '../../../../shared/ui/Reserved';
import { Select } from '../../../../shared/ui/Select';
import { card } from '../../../../shared/ui/styles';
import { OPEN_ROWS, ROWS, isOpenKey, shortDay } from '../../model/usage';
import type { Metric, Period } from '../../model/usage';
import { WIDEST_MARK, axisTicks, chartColumns } from '../../model/usageChart';
import { BarChart } from './BarChart';
import { usageChartStrings as s } from './strings/UsageChart.strings';

export function UsageChart({ report }: { report: UsageReport | null }) {
  const [metric, setMetric] = useState<Metric>('activeStudents');
  const [period, setPeriod] = useState<Period>('day');
  const opens = report?.opens ?? null;
  const metrics = [
    ...ROWS.map((r) => ({ value: r.key, label: r.label })),
    ...(opens ? OPEN_ROWS.map((r) => ({ value: r.key, label: r.label })) : []),
  ];
  const byWeek = period === 'week' && !isOpenKey(metric);
  const columns = chartColumns(report, metric, byWeek);
  const ticks = axisTicks(Math.max(0, ...columns.map((c) => (c.value === FEW ? 0 : c.value))));
  const name = metrics.find((m) => m.value === metric)?.label ?? '';
  const first = columns[0];
  const last = columns.at(-1);
  return (
    <section aria-labelledby="usage-chart" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="usage-chart" className="text-lg font-semibold">
          {byWeek ? s.chart.byWeek : s.chart.byDay}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Select
            label={s.chart.figure}
            value={metric}
            options={metrics}
            onChange={setMetric}
            disabled={!report}
            className="w-60"
          />
          <Select
            label={s.chart.period}
            value={isOpenKey(metric) ? 'day' : period}
            options={[
              { value: 'day', label: s.chart.days },
              { value: 'week', label: s.chart.weeks },
            ]}
            onChange={setPeriod}
            disabled={!report || isOpenKey(metric)}
            className="w-48"
          />
        </div>
      </div>
      <div className={`${card} mt-3 px-4 pt-4 pb-3 sm:px-5`}>
        <BarChart label={s.chart.label(name, byWeek)} columns={columns} ticks={ticks} />
        <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs text-muted tabular-nums">
          <span aria-hidden="true" className="invisible">
            {WIDEST_MARK}
          </span>
          <div className="flex justify-between">
            <Reserved longest={s.chart.longestDay} className="text-left">
              <span>{first ? shortDay(first.key) : ''}</span>
            </Reserved>
            <Reserved longest={s.chart.longestDay} className="text-right">
              <span>{last ? shortDay(last.key) : ''}</span>
            </Reserved>
          </div>
        </div>
      </div>
    </section>
  );
}
