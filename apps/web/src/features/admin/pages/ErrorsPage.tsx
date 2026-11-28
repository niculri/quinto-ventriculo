// «Administración» → «Errores»: the pages that failed in the browsers in the last 7 or 30 days, by error, with what
// helps to find the cause, and each one (or all of them) copied for Claude.
import { useState } from 'react';
import type { ClientErrorPeriod } from '@qv/schema';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { Reserved } from '../../../shared/ui/Reserved';
import { card } from '../../../shared/ui/styles';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { ErrorFilters } from '../components/errors/ErrorFilters';
import { ErrorItem } from '../components/errors/ErrorItem';
import { CopyButton } from '../components/reports/CopyButton';
import { useAccountLabels } from '../hooks/useAccountLabels';
import { useClientErrors } from '../hooks/useClientErrors';
import { accountsOf, claudeTextAll, filterErrors, versionsOf } from '../model/clientErrors';
import type { ErrorFilter } from '../model/clientErrors';
import { clientErrorsStrings as e } from '../model/strings/clientErrors.strings';
import { errorsPageStrings as s } from './strings/ErrorsPage.strings';

export function ErrorsPage() {
  const [days, setDays] = useState<ClientErrorPeriod>(30);
  const [filter, setFilter] = useState<ErrorFilter>({ kind: '', version: '', account: '' });
  const query = useClientErrors(days);
  const groups = query.data?.groups ?? [];
  const shown = filterErrors(groups, filter);
  const accounts = accountsOf(groups);
  const labels = useAccountLabels(accounts);
  const times = shown.reduce((n, g) => n + g.count, 0);
  return (
    <>
      <AdminSectionTitle title={s.title}>
        <CopyButton text={claudeTextAll(shown, days)} label={s.copyAll} />
      </AdminSectionTitle>
      <p className="mt-2 text-sm text-muted">{s.intro}</p>
      <ErrorFilters
        days={days}
        onDays={setDays}
        filter={filter}
        onFilter={setFilter}
        versions={versionsOf(groups)}
        accounts={accounts}
        labels={labels}
      />
      <Reserved longest={s.longestSummary} className="mt-4 text-sm text-muted tabular-nums">
        <p>{query.data ? s.summary(shown.length, e.times(times)) : ''}</p>
      </Reserved>
      {query.isError ? (
        <div className="mt-4">
          <ErrorWithRetry error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : !query.data ? (
        <Loading />
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{groups.length ? s.noneFiltered : s.none}</p>
      ) : (
        <>
          {query.data.more ? <p className="mt-2 text-sm text-muted">{s.more}</p> : null}
          <ul aria-label={s.list} className={`${card} mt-3 divide-y divide-border`}>
            {shown.map((g) => (
              <ErrorItem
                key={[g.kind, g.page, g.message, g.version].join('\u0000')}
                group={g}
                days={days}
                labels={labels}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
