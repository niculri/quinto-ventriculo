// One report of a group: its category, place, version and comment, and who wrote it when asked (with «Bloquear»).
import { useState } from 'react';
import { Ban } from 'lucide-react';
import { formatDateTime } from '../../../../shared/lib/dates';
import { button } from '../../../../shared/ui/styles';
import { CATEGORY_LABELS, placeLabel, placeLink } from '../../../reports/model/labels';
import type { QueueReport, Reporter, ReportGroup } from '../../../reports/api/repository';
import { reportsStrings } from '../../reports.strings';
import { BlockDialog } from './ReportDialogs';
import { PlaceAnchor } from './PlaceAnchor';

const s = reportsStrings;

export function ReportItem({
  group,
  report: r,
  names,
}: {
  group: ReportGroup;
  report: QueueReport;
  names: boolean;
}) {
  const where = placeLabel(r.location);
  const quote = r.location.quote?.exact;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          <span className="font-medium text-ink">{CATEGORY_LABELS[r.category]}</span>
          {where ? `${s.sep}${where}` : ''}
          {r.version ? s.sawVersion(r.version) : ''}
        </span>
        <span>{formatDateTime(r.createdAt)}</span>
      </div>
      {quote ? (
        <blockquote className="mt-2 border-l-2 border-brand pl-3 text-sm text-ink">
          {group.kind === 'note' && placeLink('note', group.targetId, null, r.location) ? (
            <PlaceAnchor to={placeLink('note', group.targetId, null, r.location)!} external>
              {s.quote(quote)}
            </PlaceAnchor>
          ) : (
            s.quote(quote)
          )}
        </blockquote>
      ) : null}
      <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{r.comment}</p>
      {names ? <ReporterLine reporter={r.reporter} /> : null}
    </li>
  );
}

function ReporterLine({ reporter }: { reporter: Reporter | null }) {
  const [blocking, setBlocking] = useState(false);
  if (!reporter) {
    return <p className="mt-2 text-xs text-muted">{s.noAuthor}</p>;
  }
  const who = reporter.name ?? reporter.email ?? s.noName;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <span>
        {who}
        {reporter.name && reporter.email ? `${s.sep}${reporter.email}` : ''}
      </span>
      {reporter.blocked ? (
        <span className="font-medium">{s.noPermission}</span>
      ) : (
        <button
          type="button"
          onClick={() => setBlocking(true)}
          className={`${button.base} ${button.ghost} px-2 py-1 text-xs`}
        >
          <Ban className="size-3.5" aria-hidden="true" /> {s.block}
        </button>
      )}
      {blocking ? (
        <BlockDialog who={who} userId={reporter.id} onClose={() => setBlocking(false)} />
      ) : null}
    </div>
  );
}
