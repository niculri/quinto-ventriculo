// «Errores»'s filters: the period, the kind, the deploy and the person.
import { CLIENT_ERROR_KINDS, CLIENT_ERROR_PERIODS } from '@qv/schema';
import type { ClientErrorKind, ClientErrorPeriod } from '@qv/schema';
import { Select } from '../../../../shared/ui/Select';
import type { AccountLabel } from '../../api/repository';
import { NO_VERSION, personName } from '../../model/clientErrors';
import type { ErrorFilter } from '../../model/clientErrors';
import { clientErrorsStrings as e } from '../../model/strings/clientErrors.strings';
import { errorFiltersStrings as s } from './strings/ErrorFilters.strings';

export function ErrorFilters({
  days,
  onDays,
  filter,
  onFilter,
  versions,
  accounts,
  labels,
}: {
  days: ClientErrorPeriod;
  onDays: (d: ClientErrorPeriod) => void;
  filter: ErrorFilter;
  onFilter: (f: ErrorFilter) => void;
  versions: readonly string[];
  accounts: readonly string[];
  labels: readonly AccountLabel[];
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Select
        label={s.period}
        value={String(days)}
        options={CLIENT_ERROR_PERIODS.map((d) => ({ value: String(d), label: s.days(d) }))}
        onChange={(v) => {
          onDays(v === '7' ? 7 : 30);
        }}
        className="w-44"
      />
      <Select<ClientErrorKind | ''>
        label={s.kind}
        value={filter.kind}
        options={[
          { value: '', label: s.allKinds },
          ...CLIENT_ERROR_KINDS.map((k) => ({ value: k, label: e.kinds[k] })),
        ]}
        onChange={(kind) => {
          onFilter({ ...filter, kind });
        }}
        className="w-60"
      />
      <Select
        label={s.version}
        value={filter.version}
        options={[
          { value: '', label: s.allVersions },
          ...versions.map((v) => ({ value: v, label: v === NO_VERSION ? e.noVersion : v })),
        ]}
        onChange={(version) => {
          onFilter({ ...filter, version });
        }}
        className="w-56"
      />
      <Select
        label={s.person}
        value={filter.account}
        options={[
          { value: '', label: s.everybody },
          ...accounts.map((id) => ({ value: id, label: personName(id, labels) })),
        ]}
        onChange={(account) => {
          onFilter({ ...filter, account });
        }}
        className="w-72"
      />
    </div>
  );
}
