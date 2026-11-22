// «Administración» → «Reportes»: the students' reports grouped by content, with one decision for all its reports.
import { useState } from 'react';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { useReportQueue } from '../../reports/hooks/useReports';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { BlockedList, ReportGroups } from '../components/reports/ReportGroups';
import type { Showing } from '../components/reports/ReportGroups';
import { reportsPageStrings as s } from './strings/ReportsPage.strings';

/** Who reported is hidden until it is asked for; blocking is only from there. */
export function ReportsPage() {
  const queue = useReportQueue();
  const [showing, setShowing] = useState<Showing>('open');
  const [names, setNames] = useState(false);
  if (queue.isError) {
    return (
      <>
        <AdminSectionTitle title={s.title} />
        <div className="mt-6">
          <ErrorWithRetry error={queue.error} onRetry={() => void queue.refetch()} />
        </div>
      </>
    );
  }
  if (!queue.data) {
    return (
      <>
        <AdminSectionTitle title={s.title} />
        <Loading />
      </>
    );
  }
  return (
    <>
      <AdminSectionTitle title={s.title} />
      <ReportGroups
        queue={queue.data}
        showing={showing}
        onShow={setShowing}
        names={names}
        onNames={setNames}
      />
      <BlockedList queue={queue.data} names={names} />
    </>
  );
}
