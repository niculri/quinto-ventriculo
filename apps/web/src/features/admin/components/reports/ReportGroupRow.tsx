// The reports of one content, together: what it is and its version today, the categories, the decision or the notice
// that it changed, each report, and one decision (resolve or reopen) for all of them.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { formatDateTime } from '../../../../shared/lib/dates';
import { button, card } from '../../../../shared/ui/styles';
import { locateNote } from '../../../catalog/model/catalog';
import { useCatalog } from '../../../catalog/hooks/useCatalog';
import { useCard } from '../../../decks/hooks/useCard';
import {
  CATEGORY_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  chatText,
  codeWithVersion,
  placeLink,
} from '../../../reports/model/labels';
import { useReopenReports } from '../../../reports/hooks/useReports';
import { ReportError } from '../../../reports/api/repository';
import { splitCardId } from '../../../reports/model/targets';
import type { ReportGroup } from '../../../reports/api/repository';
import { categoryCounts, changedSince } from '../../model/reports';
import { reportsStrings } from '../../reports.strings';
import { CopyButton } from './CopyButton';
import { PlaceAnchor } from './PlaceAnchor';
import { ReportItem } from './ReportItem';
import { ResolveDialog } from './ReportDialogs';

const s = reportsStrings;

/** The version of the content today: a card's from the API, an article's from the catalog; a test's has none. */
function useNoteVersion(group: ReportGroup): number | null {
  const catalog = useCatalog();
  if (group.kind !== 'note' || !catalog.data) return null;
  return locateNote(catalog.data, 'id', group.targetId)?.note.version ?? null;
}

function CardVersion({
  targetId,
  children,
}: {
  targetId: string;
  children: (version: number | null) => ReactNode;
}) {
  const { noteGuid, ord } = splitCardId(targetId);
  const detail = useCard(noteGuid, ord);
  return <>{children(detail.data?.version ?? null)}</>;
}

export function ReportGroupRow({ group: g, names }: { group: ReportGroup; names: boolean }) {
  const [resolving, setResolving] = useState(false);
  const reopen = useReopenReports();
  const noteVersion = useNoteVersion(g);
  const body = (current: number | null) => (
    <li className={`${card} px-4 py-4 sm:px-5`}>
      <GroupHead group={g} />
      <ul aria-label={s.categories} className="mt-2 flex flex-wrap gap-1.5">
        {[...categoryCounts(g)].map(([c, n]) => (
          <li key={c} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
            {CATEGORY_LABELS[c]}
            {n > 1 ? `${s.sep}${n}` : ''}
          </li>
        ))}
      </ul>
      <GroupState group={g} current={current} />
      <ol className="mt-3 divide-y divide-border border-t border-border">
        {g.reports.map((r) => (
          <ReportItem key={r.id} group={g} report={r} names={names} />
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {g.resolution ? (
          <button
            type="button"
            disabled={reopen.isPending}
            onClick={() => reopen.mutate(g.resolution!.id)}
            className={`${button.base} ${button.secondary} px-3 py-1.5`}
          >
            <RotateCcw className="size-4" aria-hidden="true" /> {s.reopen}
          </button>
        ) : (
          <>
            <CopyButton text={chatText([g])} label={s.copy.one} />
            <button
              type="button"
              onClick={() => setResolving(true)}
              className={`${button.base} ${button.primary} px-3 py-1.5`}
            >
              <Check className="size-4" aria-hidden="true" /> {s.resolve}
            </button>
          </>
        )}
      </div>
      {reopen.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {reopen.error instanceof ReportError ? reopen.error.message : s.notReopened}
        </p>
      ) : null}
      {resolving ? (
        <ResolveDialog group={g} current={current} onClose={() => setResolving(false)} />
      ) : null}
    </li>
  );
  if (g.kind === 'card' && !g.resolution) {
    return <CardVersion targetId={g.targetId}>{body}</CardVersion>;
  }
  return body(noteVersion);
}

function GroupHead({ group: g }: { group: ReportGroup }) {
  const link = placeLink(g.kind, g.targetId, g.code, g.reports[0]?.location ?? {});
  const code = codeWithVersion(g.code, g.version) ?? g.targetId;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
          {KIND_LABELS[g.kind]}
        </span>
        {link ? (
          <PlaceAnchor to={link} external={g.kind === 'note'}>
            <span className="font-mono text-sm font-medium">{code}</span>
          </PlaceAnchor>
        ) : (
          <span className="font-mono text-sm font-medium">{code}</span>
        )}
        {g.title ? <span className="min-w-0 text-sm text-ink">{g.title}</span> : null}
      </div>
      <span className="text-xs text-muted">
        {s.people(g.reporters)}
        {s.sep}
        {formatDateTime(g.lastAt)}
      </span>
    </div>
  );
}

/** The decision taken, or (still open) whether the content changed since it was reported. */
function GroupState({ group: g, current }: { group: ReportGroup; current: number | null }) {
  if (!g.resolution) {
    const oldest = changedSince(g, current);
    return oldest === null ? null : (
      <p className="mt-2 rounded-md bg-brand-soft px-3 py-1.5 text-sm text-ink">
        {s.version(oldest, current!)}
      </p>
    );
  }
  const r = g.resolution;
  return (
    <p className="mt-3 text-sm">
      <span className="font-medium">
        {STATUS_LABELS[r.status]}
        {r.status === 'fixed' && r.fixedVersion ? s.inVersion(r.fixedVersion) : ''}
      </span>
      <span className="text-muted">
        {s.sep}
        {formatDateTime(r.resolvedAt)}
      </span>
      {r.note ? <span className="mt-1 block whitespace-pre-wrap text-muted">{r.note}</span> : null}
    </p>
  );
}
