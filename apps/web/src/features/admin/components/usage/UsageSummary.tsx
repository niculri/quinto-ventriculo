// The summary of «Uso»: each figure today, in 7 days and in 30 days, and when it was counted.
import type { UsageReport } from '@qv/schema';
import { formatDateTime } from '../../../../shared/lib/dates';
import { Skeleton } from '../../../../shared/ui/Loading';
import { Reserved } from '../../../../shared/ui/Reserved';
import { card } from '../../../../shared/ui/styles';
import { OPEN_ROWS, PERIODS, ROWS, figure } from '../../model/usage';
import { usageStrings } from '../../usage.strings';

const s = usageStrings.summary;

const statusOf = (report: UsageReport | null) =>
  report
    ? report.opensStatus === 'not_configured'
      ? s.notConfigured
      : report.opensStatus === 'unavailable'
        ? s.unavailable
        : s.at(formatDateTime(report.generatedAt))
    : '';

export function UsageSummary({ report }: { report: UsageReport | null }) {
  const opens = report?.opens ?? null;
  return (
    <section aria-labelledby="usage-summary" className="mt-6">
      <h3 id="usage-summary" className="sr-only">
        {s.title}
      </h3>
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="px-4 py-2.5 text-left font-medium sm:px-5">
                <span className="sr-only">{s.figure}</span>
              </th>
              {PERIODS.map((p) => (
                <th
                  key={p.key}
                  scope="col"
                  className="w-[18%] px-1.5 py-2.5 text-right font-medium sm:w-[22%] sm:px-2"
                >
                  {p.label}
                </th>
              ))}
              <th aria-hidden="true" className="w-2 sm:w-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => (
              <SummaryRow key={row.key} label={row.label}>
                {PERIODS.map((p) =>
                  report ? figure(report.totals[p.key][row.key], row.students) : null,
                )}
              </SummaryRow>
            ))}
            {OPEN_ROWS.map((row) => (
              <SummaryRow key={row.key} label={row.label}>
                {PERIODS.map((p) =>
                  report
                    ? opens
                      ? figure(opens.totals[p.key][row.key])
                      : usageStrings.none
                    : null,
                )}
              </SummaryRow>
            ))}
          </tbody>
        </table>
        <Reserved
          longest={s.unavailable}
          className="border-t border-border px-4 py-2.5 text-xs sm:px-5"
        >
          <p role="status" className="text-muted">
            {statusOf(report)}
          </p>
        </Reserved>
      </div>
    </section>
  );
}

function SummaryRow({ label, children }: { label: string; children: (string | null)[] }) {
  return (
    <tr className="h-10">
      <th
        scope="row"
        className="py-2 pr-2 pl-4 text-left leading-snug font-normal text-ink sm:pl-5"
      >
        {label}
      </th>
      {children.map((v, i) => (
        <td key={i} className="px-1.5 text-right whitespace-nowrap text-ink tabular-nums sm:px-2">
          {v === null ? <Skeleton className="ml-auto h-4 w-10" /> : v}
        </td>
      ))}
      <td aria-hidden="true" />
    </tr>
  );
}
