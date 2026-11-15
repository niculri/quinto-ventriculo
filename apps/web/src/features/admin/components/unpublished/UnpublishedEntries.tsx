// «Fuera del sitio»'s two lists: what is off now and the whole record, each entry with its reason and what it took.
import type { UnpublishedEntry } from '@qv/schema';
import { formatDateTime } from '../../../../shared/lib/dates';
import { card } from '../../../../shared/ui/styles';
import { entryState, offNow, removedLine } from '../../model/unpublished';
import { adminStrings } from '../../strings';

const s = adminStrings.unpublished;

export function UnpublishedEntries({
  entries,
  total,
}: {
  entries: UnpublishedEntry[];
  total: number;
}) {
  const now = offNow(entries);
  return (
    <>
      <section aria-labelledby="off-now" className="mt-6">
        <h3 id="off-now" className="text-lg font-semibold">
          {s.offNow}
        </h3>
        {now.length ? (
          <ul className={`${card} mt-3 divide-y divide-border`}>
            {now.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-muted">{s.nothingOff}</p>
        )}
      </section>
      <section aria-labelledby="off-log" className="mt-8">
        <h3 id="off-log" className="text-lg font-semibold">
          {s.record}
        </h3>
        {entries.length ? (
          <>
            <ul className={`${card} mt-3 divide-y divide-border`}>
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
            {total > entries.length ? (
              <p className="mt-2 text-xs text-muted">{s.latest(entries.length, total)}</p>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-muted">{s.neverOff}</p>
        )}
      </section>
    </>
  );
}

function EntryRow({ entry: e }: { entry: UnpublishedEntry }) {
  const state = entryState(e);
  const what = removedLine(e);
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {s.kinds[e.kind]}
          </p>
          <p className="font-medium break-words text-ink">{e.title ?? e.itemId}</p>
          {e.title ? <p className="font-mono text-xs break-all text-muted">{e.itemId}</p> : null}
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-medium ${state.tone}`}>
          {state.label}
        </span>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{e.reason}</p>
      <p className="mt-1 text-xs text-muted">
        {formatDateTime(e.doneAt)} · {e.by}
        {what ? ` · ${what}` : ''}
      </p>
    </li>
  );
}
