// «Administración» → «Acceso»: inviting by list, who is invited, removing invitations and naming administrators.
import { Loading } from '../../../shared/ui/Loading';
import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { AccessView } from '../components/access/AccessView';
import { useAccessReport } from '../hooks/useAccess';
import { accessFailure } from '../hooks/accessFailure';
import { accessPageStrings as s } from './strings/AccessPage.strings';

/** `youAreOwner` comes with the report, so the site owner's buttons never appear after it. */
export function AccessPage() {
  const report = useAccessReport();
  return (
    <>
      <AdminSectionTitle title={s.title} />
      {report.isError ? (
        <div className="mt-6">
          <Notice title={s.notLoaded}>
            <p>{accessFailure(report.error)}</p>
            <button
              type="button"
              onClick={() => void report.refetch()}
              className={`${button.base} ${button.secondary} mt-3`}
            >
              {s.retry}
            </button>
          </Notice>
        </div>
      ) : !report.data ? (
        <Loading />
      ) : (
        <AccessView report={report.data} />
      )}
    </>
  );
}
