// A report in «Mis reportes»: what it is about (with its link and code), its status, place, quote, comment and answer.
import { Link } from 'react-router';
import type { MyReport } from '@qv/schema/user';
import { formatDateTime } from '../../../shared/lib/dates';
import {
  CATEGORY_LABELS,
  KIND_LABELS,
  codeWithVersion,
  myReportTitle,
  placeLabel,
  placeLink,
  studentStatus,
} from '../model/labels';
import { myReportsStrings as s } from '../myReports.strings';

export function MyReportItem({ report: r }: { report: MyReport }) {
  const link = placeLink(r.kind, r.targetId, r.code, r.location);
  const code = codeWithVersion(r.code, r.version);
  const where = placeLabel(r.location);
  const done = r.resolution !== null;
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 text-sm">
          <span className="text-muted">{KIND_LABELS[r.kind]} · </span>
          {link ? (
            <Link to={link} className="font-medium text-ink hover:underline">
              {myReportTitle(r)}
            </Link>
          ) : (
            <span className="font-medium text-ink">{myReportTitle(r)}</span>
          )}
          {code ? <span className="ml-2 font-mono text-xs text-muted">{code}</span> : null}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            done ? 'bg-brand-soft text-ink' : 'bg-surface-2 text-muted'
          }`}
        >
          {studentStatus(r.resolution)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {CATEGORY_LABELS[r.category]}
        {where ? ` · ${where}` : ''} · {formatDateTime(r.createdAt)}
      </p>
      {r.location.quote?.exact ? (
        <blockquote className="mt-2 line-clamp-3 border-l-2 border-brand pl-3 text-sm text-ink">
          «{r.location.quote.exact}»
        </blockquote>
      ) : null}
      <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{r.comment}</p>
      {r.resolution?.note ? (
        <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink">
          <span className="font-medium">{s.answer}</span>
          {r.resolution.note}
        </p>
      ) : null}
    </li>
  );
}
