import { useEffect } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../../lib/dates';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { card } from '../../ui/styles';
import { SettingsLayout } from '../settings/SettingsLayout';
import {
  CATEGORY_LABELS,
  KIND_LABELS,
  codeWithVersion,
  myReportTitle,
  placeLabel,
  placeLink,
  studentStatus,
} from './labels';
import { useMyReports } from './queries';
import type { MyReport } from './repository';

/**
 * «Opciones» → «Mis reportes» (step 2.6): what the student reported and what happened with each one: «Recibido»,
 * «Corregido (versión N)» or «Revisado: no es un error», with the reason. Only theirs: never who else reported it.
 */
export function MyReportsPage() {
  const reports = useMyReports();
  useEffect(() => {
    document.title = 'Mis reportes · El Quinto Ventrículo';
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, []);
  return (
    <SettingsLayout>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Mis reportes</h2>
      <p className="mt-1 text-sm text-muted">
        Los errores que reportaste en tarjetas, apuntes y tests, y qué pasó con cada uno.
      </p>
      {reports.isError ? (
        <div className="mt-6">
          <ErrorWithRetry error={reports.error} onRetry={() => void reports.refetch()} />
        </div>
      ) : !reports.data ? (
        <Loading />
      ) : reports.data.length ? (
        <ol className={`${card} mt-6 divide-y divide-border`}>
          {reports.data.map((r) => (
            <Item key={r.id} report={r} />
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-muted">
          Todavía no has reportado nada. Si encuentras un error, usa «Reportar error» en la tarjeta,
          la pregunta o el apunte.
        </p>
      )}
    </SettingsLayout>
  );
}

function Item({ report: r }: { report: MyReport }) {
  const link = placeLink(r.kind, r.targetId, r.code, r.location);
  const code = codeWithVersion(r.code, r.version);
  const where = placeLabel(r.location);
  const done = r.resolution !== null;
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 text-sm">
          <span className="text-muted">{KIND_LABELS[r.kind]} · </span>
          {link ? (
            <Link to={link} className="font-medium text-ink hover:underline">
              {myReportTitle(r)}
            </Link>
          ) : (
            <span className="font-medium text-ink">{myReportTitle(r)}</span>
          )}
          {code ? <span className="ml-2 font-mono text-xs text-muted">{code}</span> : null}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            done ? 'bg-brand-soft text-ink' : 'bg-surface-2 text-muted'
          }`}
        >
          {studentStatus(r.resolution)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {CATEGORY_LABELS[r.category]}
        {where ? ` · ${where}` : ''} · {formatDateTime(r.createdAt)}
      </p>
      {r.location.quote?.exact ? (
        <blockquote className="mt-2 line-clamp-3 border-l-2 border-brand pl-3 text-sm text-ink">
          «{r.location.quote.exact}»
        </blockquote>
      ) : null}
      <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{r.comment}</p>
      {r.resolution?.note ? (
        <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink">
          <span className="font-medium">Respuesta: </span>
          {r.resolution.note}
        </p>
      ) : null}
    </li>
  );
}
