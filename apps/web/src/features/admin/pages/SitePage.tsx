// «Administración» → «Sitio»: the switch that hides the semesters without published material, at once.
import { useId } from 'react';
import { formatDateTime } from '../../../shared/lib/dates';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { Switch } from '../../../shared/ui/Switch';
import { card } from '../../../shared/ui/styles';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { CourseSwitches } from '../components/site/CourseSwitches';
import { useSetSiteSettings, useSiteSettings } from '../hooks/useSiteSettings';
import { sitePageStrings as s } from './strings/SitePage.strings';

export function SitePage() {
  const id = useId();
  const settings = useSiteSettings(true);
  const save = useSetSiteSettings();
  const saving = save.isPending ? save.variables.hideEmptySemesters : undefined;
  const value = saving ?? settings.data?.hideEmptySemesters ?? false;
  const status = save.isError
    ? s.notSaved
    : settings.isError
      ? s.notLoaded
      : settings.data?.updatedAt
        ? s.changed(formatDateTime(settings.data.updatedAt), settings.data.updatedBy)
        : '';
  return (
    <>
      <AdminSectionTitle title={s.title} />
      <div className={`${card} mt-6 px-4 py-4 sm:px-5`}>
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor={id} className="font-medium text-ink">
              {s.label}
            </label>
            <p className="mt-1 text-sm text-muted">{s.help}</p>
          </div>
          <span className="mt-0.5 flex h-6 w-10 flex-none items-center">
            {settings.data || settings.isError ? (
              <Switch
                id={id}
                label={s.label}
                checked={value}
                wholeRow
                disabled={!settings.data || save.isPending}
                onChange={(v) => save.mutate({ hideEmptySemesters: v })}
              />
            ) : (
              <Skeleton className="h-6 w-10 rounded-full" />
            )}
          </span>
        </div>
        <Reserved longest={s.longest} className="mt-2 text-xs">
          <p
            role={save.isError ? 'alert' : undefined}
            className={save.isError ? 'text-state-learn' : 'text-muted'}
          >
            {status}
          </p>
        </Reserved>
      </div>
      {settings.data ? <CourseSwitches settings={settings.data} /> : null}
    </>
  );
}
