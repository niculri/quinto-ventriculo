// The open or the resolved reports, with the tabs to choose, the switch that shows who reported and the copy for the
// chat; then the people without permission to report.
import type { ReportQueue } from '../../../reports/api/repository';
import { Switch } from '../../../../shared/ui/Switch';
import { card } from '../../../../shared/ui/styles';
import { chatText } from '../../../reports/model/labels';
import { reportsStrings } from '../../reports.strings';
import { BlockedRow } from './BlockedRow';
import { CopyButton } from './CopyButton';
import { ReportGroupRow } from './ReportGroupRow';

const s = reportsStrings;

export type Showing = 'open' | 'resolved';

export function ReportGroups({
  queue,
  showing,
  onShow,
  names,
  onNames,
}: {
  queue: ReportQueue;
  showing: Showing;
  onShow: (showing: Showing) => void;
  names: boolean;
  onNames: (names: boolean) => void;
}) {
  const { open, resolved } = queue;
  const list = showing === 'open' ? open : resolved;
  const tab = (value: Showing, label: string, n: number) => (
    <button
      type="button"
      aria-pressed={showing === value}
      onClick={() => onShow(value)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        showing === value ? 'bg-brand-soft text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {s.tab(label, n)}
    </button>
  );
  return (
    <section aria-labelledby="reports" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="reports" className="text-lg font-semibold">
          {s.reported}
        </h3>
        <div role="group" aria-label={s.showing} className="flex gap-1">
          {tab('open', s.open, open.length)}
          {tab('resolved', s.resolved, resolved.length)}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <Switch label={s.names} checked={names} onChange={onNames} />
          {s.names}
        </label>
        {showing === 'open' && open.length ? (
          <CopyButton text={chatText(open)} label={s.copyAll} />
        ) : null}
      </div>
      {list.length ? (
        <ol className="mt-3 space-y-3">
          {list.map((g) => (
            <ReportGroupRow
              key={`${g.resolution?.id ?? ''}|${g.kind}|${g.targetId}`}
              group={g}
              names={names}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-muted">{showing === 'open' ? s.noneOpen : s.noneResolved}</p>
      )}
    </section>
  );
}

export function BlockedList({ queue, names }: { queue: ReportQueue; names: boolean }) {
  const { blocked } = queue;
  if (!blocked.length) return null;
  return (
    <section aria-labelledby="reports-blocked" className="mt-10">
      <h3 id="reports-blocked" className="text-lg font-semibold">
        {s.blocked(blocked.length)}
      </h3>
      <ul className={`${card} mt-3 divide-y divide-border`}>
        {blocked.map((b) => (
          <BlockedRow key={b.id} id={b.id} at={b.blockedAt}>
            {names ? (b.name ?? b.email ?? s.noName) : s.blockedPerson}
            {names && b.name && b.email ? `${s.sep}${b.email}` : ''}
          </BlockedRow>
        ))}
      </ul>
    </section>
  );
}
