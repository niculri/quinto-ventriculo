// The student's answers, time and % of reviews not failed today, in 7 and 30 days and in the last year; the advanced
// mode adds the % of young and mature cards apart.

import { PERIODS } from '@qv/study';
import type { CardStatsData } from '@qv/study';
import { Skeleton } from '../../../shared/ui/Loading';
import { periodRows } from '../model/periods';
import { periodTableStrings as s } from './strings/PeriodTable.strings';

const cell = 'px-2 py-2 text-right tabular-nums';

export function PeriodTable({
  data,
  advanced,
}: {
  data: Pick<CardStatsData, 'days' | 'today'> | null;
  advanced: boolean;
}) {
  const rows = data ? periodRows(data) : null;
  return (
    <div>
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <caption className="sr-only">{s.caption}</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="px-2 py-2 text-left font-medium">
                {s.columns.period}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {s.columns.answers}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {s.columns.time}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {s.columns.retention}
              </th>
              {advanced ? (
                <>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {s.columns.young}
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {s.columns.mature}
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period, i) => {
              const r = rows?.[i];
              const value = (text: string) =>
                r ? text : <Skeleton className="ml-auto h-4 w-10" />;
              return (
                <tr key={period} className="h-12 border-b border-border last:border-0">
                  <th scope="row" className="px-2 py-2 text-left font-medium">
                    {s.period(period)}
                  </th>
                  <td className={cell}>{value(r ? s.count(r.answers) : '')}</td>
                  <td className={cell}>{value(r ? s.time(r.ms) : '')}</td>
                  <td className={cell}>
                    {r ? (
                      <>
                        <span className="font-semibold">{s.percent(r.retention)}</span>
                        <span className="block text-xs text-muted">{s.reviews(r.reviews)}</span>
                      </>
                    ) : (
                      <Skeleton className="ml-auto h-4 w-10" />
                    )}
                  </td>
                  {advanced ? (
                    <>
                      <td className={cell}>{value(r ? s.percent(r.young) : '')}</td>
                      <td className={cell}>{value(r ? s.percent(r.mature) : '')}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">{s.hint}</p>
    </div>
  );
}
