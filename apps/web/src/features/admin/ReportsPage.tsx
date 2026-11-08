import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../../app/paths';
import { formatDateTime } from '../../lib/dates';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { button, card } from '../../ui/styles';
import { AdminSectionTitle } from './AdminLayout';
import { useCardReports, useSetReportStatus } from './queries';
import type { CardReport, ReportStatus } from './repository';

/**
 * «Administración» → «Reportes»: the errors the students reported in the cards («Reportar error»), open or resolved.
 * Step 2.6 adds those of the rest of the content.
 */
export function ReportsPage() {
  const reports = useCardReports(true);
  const [showing, setShowing] = useState<ReportStatus>('open');
  if (reports.isError) {
    return (
      <>
        <AdminSectionTitle title="Reportes" />
        <div className="mt-6">
          <ErrorWithRetry error={reports.error} onRetry={() => void reports.refetch()} />
        </div>
      </>
    );
  }
  if (!reports.data) {
    return (
      <>
        <AdminSectionTitle title="Reportes" />
        <Loading />
      </>
    );
  }
  const open = reports.data.filter((r) => r.status === 'open');
  const resolved = reports.data.filter((r) => r.status === 'resolved');
  const list = showing === 'open' ? open : resolved;
  const tab = (status: ReportStatus, label: string, n: number) => (
    <button
      type="button"
      aria-pressed={showing === status}
      onClick={() => setShowing(status)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        showing === status ? 'bg-brand-soft text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {label} ({n})
    </button>
  );
  return (
    <>
      <AdminSectionTitle title="Reportes" />
      <section aria-labelledby="reports" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="reports" className="text-lg font-semibold">
            Errores reportados en tarjetas
          </h3>
          <div role="group" aria-label="Qué reportes mostrar" className="flex gap-1">
            {tab('open', 'Abiertos', open.length)}
            {tab('resolved', 'Resueltos', resolved.length)}
          </div>
        </div>
        {list.length ? (
          <ol className={`${card} mt-3 divide-y divide-border`}>
            {list.map((r) => (
              <ReportRow key={r.id} report={r} />
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-muted">
            {showing === 'open'
              ? 'No hay reportes abiertos.'
              : 'Todavía no hay reportes resueltos.'}
          </p>
        )}
      </section>
    </>
  );
}

function ReportRow({ report: r }: { report: CardReport }) {
  const status = useSetReportStatus();
  const next: ReportStatus = r.status === 'open' ? 'resolved' : 'open';
  const code = r.code ? `${r.code}${r.version ? `.${r.version}` : ''}` : 'Tarjeta sin código';
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <Link
          to={paths.browse({ q: r.code ? `"${r.code}"` : null, note: r.noteGuid, ord: r.ord })}
          className="font-mono text-sm font-medium text-ink hover:underline"
        >
          {code}
        </Link>
        <span className="text-xs text-muted">{formatDateTime(r.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.comment}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {r.reporterName ?? r.reporterEmail ?? 'Cuenta eliminada'}
          {r.reporterName && r.reporterEmail ? ` · ${r.reporterEmail}` : ''}
        </span>
        <button
          type="button"
          disabled={status.isPending}
          onClick={() => status.mutate({ id: r.id, status: next })}
          className={`${button.base} ${button.secondary} px-3 py-1.5`}
        >
          {next === 'resolved' ? (
            <>
              <Check className="size-4" aria-hidden="true" /> Marcar resuelto
            </>
          ) : (
            <>
              <RotateCcw className="size-4" aria-hidden="true" /> Reabrir
            </>
          )}
        </button>
      </div>
      {status.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          No se pudo cambiar. Inténtalo de nuevo.
        </p>
      ) : null}
    </li>
  );
}
