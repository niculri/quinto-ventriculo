// «Mis reportes» settings page: the student's own reports and what happened with each one.
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { card } from '../../../shared/ui/styles';
import { useTitle } from '../../../shared/hooks/useTitle';
import { SettingsLayout } from '../../settings/components/SettingsLayout';
import { useMyReports } from '../hooks/useReports';
import { MyReportItem } from '../components/MyReportItem';
import { myReportsStrings as s } from '../myReports.strings';

export function MyReportsPage() {
  const reports = useMyReports();
  useTitle(s.title);
  return (
    <SettingsLayout>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">{s.title}</h2>
      <p className="mt-1 text-sm text-muted">{s.intro}</p>
      {reports.isError ? (
        <div className="mt-6">
          <ErrorWithRetry error={reports.error} onRetry={() => void reports.refetch()} />
        </div>
      ) : !reports.data ? (
        <Loading />
      ) : reports.data.length ? (
        <ol className={`${card} mt-6 divide-y divide-border`}>
          {reports.data.map((r) => (
            <MyReportItem key={r.id} report={r} />
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-muted">{s.empty}</p>
      )}
    </SettingsLayout>
  );
}
