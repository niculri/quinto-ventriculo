import { useId } from 'react';
import { formatDateTime } from '../../lib/dates';
import { Skeleton } from '../../ui/Loading';
import { Reserved } from '../../ui/Reserved';
import { Switch } from '../../ui/Switch';
import { card } from '../../ui/styles';
import { AdminSectionTitle } from './AdminLayout';
import { useSetSiteSettings, useSiteSettings } from './queries';

/**
 * «Administración» → «Sitio»: how the site is shown (step 1.8). One switch: the semesters without any published
 * article, deck or test are hidden, and «Inicio» says that they are coming. It changes at once, without publishing.
 */
export function SitePage() {
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
    <>
      <AdminSectionTitle title="Sitio" />
      <div className={`${card} mt-6 px-4 py-4 sm:px-5`}>
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
    </>
  );
}
