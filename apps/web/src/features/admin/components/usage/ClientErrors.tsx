// «Errores en el navegador» of «Uso»: the pages that failed in some student's browser in the last 7 days, grouped by
// what failed, where and in which deploy; never who.
import type { UsageReport } from '@qv/schema';
import { card } from '../../../../shared/ui/styles';
import { clientErrorsStrings as s } from './strings/ClientErrors.strings';

export function ClientErrors({ report }: { report: UsageReport }) {
  const errors = report.clientErrors;
  const when = new Intl.DateTimeFormat('es-CL', {
    timeZone: report.timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return (
    <section aria-labelledby="usage-client-errors" className="mt-8">
      <h3 id="usage-client-errors" className="text-lg font-semibold">
        {s.clientErrors.title}
      </h3>
      <p className="mt-1 text-sm text-muted">{s.clientErrors.help}</p>
      {errors === null ? (
        <p className="mt-3 text-sm text-muted">{s.clientErrors.unavailable}</p>
      ) : errors.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{s.clientErrors.none}</p>
      ) : (
        <ul className={`${card} mt-3 divide-y divide-border`}>
          {errors.map((e) => (
            <li
              key={[e.kind, e.page, e.message, e.version].join('\u0000')}
              className="px-4 py-3 sm:px-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">{s.clientErrors.kinds[e.kind]}</span>
                <span className="text-muted">{s.clientErrors.times(e.count)}</span>
                <span className="text-muted">
                  {s.clientErrors.last(when.format(new Date(e.lastSeen)))}
                </span>
              </div>
              {e.message ? <p className="mt-1 text-sm break-words">{e.message}</p> : null}
              <p className="mt-1 font-mono text-xs break-all text-muted">
                {e.page} ·{' '}
                {e.version ? s.clientErrors.version(e.version) : s.clientErrors.devVersion}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
