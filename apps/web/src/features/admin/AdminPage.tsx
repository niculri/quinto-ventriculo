import { useEffect, useId, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../../app/paths';
import { formatDateTime } from '../../lib/dates';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { Reserved } from '../../ui/Reserved';
import { Skeleton } from '../../ui/Loading';
import { Switch } from '../../ui/Switch';
import { button, card } from '../../ui/styles';
import { SettingsLayout } from '../settings/SettingsLayout';
import {
  useCardReports,
  useIsAdmin,
  useSetReportStatus,
  useSetSiteSettings,
  useSiteSettings,
} from './queries';
import type { CardReport, ReportStatus } from './repository';

/**
 * «Opciones» → «Panel de administración», only for administrators (anybody else gets «no existe»; the database
 * would not give them the reports anyway). For now, the errors reported in the cards.
 */
export function AdminPage() {
  const isAdmin = useIsAdmin();
  useEffect(() => {
    document.title = 'Panel de administración · El Quinto Ventrículo';
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, []);
  if (isAdmin.isPending) return <Loading />;
  if (!isAdmin.data) return <NotFoundPage />;
  return (
    <SettingsLayout>
      <h2 className="font-serif text-2xl font-semibold">Panel de administración</h2>
      <Site />
      <Reports />
    </SettingsLayout>
  );
}

/**
 * «Sitio»: how the site is shown (step 1.8). One switch: the semesters without any published article, deck or test are
 * hidden, and «Inicio» says that they are coming. It changes at once, without publishing.
 */
function Site() {
  const id = useId();
  const settings = useSiteSettings(true);
  const save = useSetSiteSettings();
  const value = save.isPending
    ? (save.variables?.hideEmptySemesters ?? false)
    : (settings.data?.hideEmptySemesters ?? false);
  const label = 'Ocultar los semestres sin contenido';
  const status = save.isError
    ? 'No se pudo guardar. Inténtalo de nuevo.'
    : settings.isError
      ? 'No se pudo cargar.'
      : settings.data?.updatedAt
        ? `Cambiado el ${formatDateTime(settings.data.updatedAt)}${
            settings.data.updatedBy ? ` por ${settings.data.updatedBy}` : ''
          }`
        : '';
  return (
    <section aria-labelledby="site" className="mt-6">
      <h3 id="site" className="text-lg font-semibold">
        Sitio
      </h3>
      <div className={`${card} mt-3 px-4 py-4 sm:px-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor={id} className="font-medium text-ink">
              {label}
            </label>
            <p className="mt-1 text-sm text-muted">
              Los semestres sin ningún apunte, mazo ni test publicado no aparecen en el sitio ni se
              abren por su enlace. En su lugar, Inicio dice «Los próximos semestres vienen pronto».
            </p>
          </div>
          {/* The same place while it loads: nothing moves when the value arrives. */}
          <span className="mt-0.5 flex h-6 w-10 flex-none items-center">
            {settings.data || settings.isError ? (
              <Switch
                id={id}
                label={label}
                checked={value}
                disabled={!settings.data || save.isPending}
                onChange={(v) => save.mutate({ hideEmptySemesters: v })}
              />
            ) : (
              <Skeleton className="h-6 w-10 rounded-full" />
            )}
          </span>
        </div>
        <Reserved
          longest="Cambiado el 30 de septiembre de 2026 a las 23:59 por nombre.apellido@ug.uchile.cl"
          className="mt-2 text-xs"
        >
          <p
            role={save.isError ? 'alert' : undefined}
            className={save.isError ? 'text-state-learn' : 'text-muted'}
          >
            {status}
          </p>
        </Reserved>
      </div>
    </section>
  );
}

function Reports() {
  const reports = useCardReports(true);
  const [showing, setShowing] = useState<ReportStatus>('open');
  if (reports.isError) {
    return <ErrorWithRetry error={reports.error} onRetry={() => void reports.refetch()} />;
  }
  if (!reports.data) return <Loading />;
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
          {showing === 'open' ? 'No hay reportes abiertos.' : 'Todavía no hay reportes resueltos.'}
        </p>
      )}
    </section>
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
