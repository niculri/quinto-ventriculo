// «Administración» → «Uso»: how much the site is used, in figures of 5 students or more, never who.
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { UsageChart } from '../components/usage/UsageChart';
import { DetailsLoading, UsageDetails } from '../components/usage/UsageDetails';
import { UsageSummary } from '../components/usage/UsageSummary';
import { WorkerRequests } from '../components/usage/WorkerRequests';
import { useUsageReport } from '../hooks/useUsageReport';
import { usagePageStrings as s } from './strings/UsagePage.strings';

/** The visits and the pages are in Cloudflare Web Analytics; `:account` opens the viewer's own account. */
const WEB_ANALYTICS_URL = 'https://dash.cloudflare.com/?to=/:account/web-analytics';

export function UsagePage() {
  const usage = useUsageReport();
  const catalog = useCatalog();
  const data = usage.data && catalog.data ? { usage: usage.data, catalog: catalog.data } : null;
  return (
    <>
      <AdminSectionTitle title={s.title}>
        <a
          href={WEB_ANALYTICS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          {s.analytics}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </AdminSectionTitle>
      <p className="mt-2 text-sm text-muted">
        {s.intro} {s.errorsBefore}
        <Link to={paths.adminErrors} className="font-medium text-brand hover:underline">
          {s.errors}
        </Link>
        .
      </p>
      {usage.isError || catalog.isError ? (
        <div className="mt-6">
          <ErrorWithRetry
            error={usage.error ?? catalog.error}
            onRetry={() => void Promise.all([usage.refetch(), catalog.refetch()])}
          />
        </div>
      ) : (
        <>
          <UsageSummary report={data?.usage ?? null} />
          <UsageChart report={data?.usage ?? null} />
          {data ? (
            <>
              <UsageDetails report={data.usage} catalog={data.catalog} />
              <WorkerRequests report={data.usage} />
            </>
          ) : (
            <DetailsLoading />
          )}
        </>
      )}
    </>
  );
}
