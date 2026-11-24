// «Pedidos al Worker» of «Uso»: the requests of each UTC day against the free plan's 100,000, so that the limit is
// seen coming before Cloudflare starts refusing.
import { WORKER_DAILY_REQUESTS } from '@qv/schema';
import type { UsageReport } from '@qv/schema';
import { card } from '../../../../shared/ui/styles';
import { workerRequestsStrings as s } from './strings/WorkerRequests.strings';

/** From here a day is shown as close to the limit. */
const NEAR_LIMIT = 0.8;

export function WorkerRequests({ report }: { report: UsageReport }) {
  const days = report.workerRequests;
  const label = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return (
    <section aria-labelledby="usage-worker-requests" className="mt-8">
      <h3 id="usage-worker-requests" className="text-lg font-semibold">
        {s.title}
      </h3>
      <p className="mt-1 text-sm text-muted">{s.help(WORKER_DAILY_REQUESTS)}</p>
      {days === null ? (
        <p className="mt-3 text-sm text-muted">{s.unavailable}</p>
      ) : (
        <table className={`${card} mt-3 w-full overflow-hidden text-sm`}>
          <caption className="sr-only">{s.title}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">
                {s.day}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {s.requests}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                {s.share}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {days.toReversed().map((d, i) => {
              const share = d.requests / WORKER_DAILY_REQUESTS;
              return (
                <tr key={d.day}>
                  <th scope="row" className="px-4 py-2 text-left font-normal sm:px-5">
                    {i === 0 ? s.today : label.format(new Date(`${d.day}T12:00:00Z`))}
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {d.requests.toLocaleString('es-CL')}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums sm:px-5 ${share >= NEAR_LIMIT ? 'font-semibold text-[#c2410c] dark:text-[#f0875a]' : 'text-muted'}`}
                  >
                    {s.percent(share)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
