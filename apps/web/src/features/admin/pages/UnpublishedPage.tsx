// «Administración» → «Fuera del sitio»: the record of what `npm run unpublish` took off the site, only to look at.
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { UnpublishedEntries } from '../components/unpublished/UnpublishedEntries';
import { useUnpublishedLog } from '../hooks/useUnpublishedLog';
import { unpublishedPageStrings as s } from './strings/UnpublishedPage.strings';

export function UnpublishedPage() {
  const log = useUnpublishedLog();
  return (
    <>
      <AdminSectionTitle title={s.title} />
      <p className="mt-2 text-sm text-muted">
        {s.introBefore}
        <code className="font-mono">{s.command}</code>
        {s.introAfter}
      </p>
      {log.isError ? (
        <ErrorWithRetry error={log.error} onRetry={() => void log.refetch()} />
      ) : !log.data ? (
        <Loading />
      ) : (
        <UnpublishedEntries entries={log.data.entries} total={log.data.total} />
      )}
    </>
  );
}
