// The list of «Tarjetas»: each card with its front, code and deck, why it is suspicious, its «Otra vez» on the first
// view and on the reviews with their intervals, what FSRS expected, its median time, who hides it and its reports.
import { Link } from 'react-router';
import type { CardRate } from '@qv/schema';
import { paths } from '../../../../shared/lib/paths';
import { Skeleton } from '../../../../shared/ui/Loading';
import { card } from '../../../../shared/ui/styles';
import { interval, percent, rateText, reasonText, seconds } from '../../model/cardQuality';
import type { QualityRow } from '../../model/cardQuality';
import { qualityListStrings as s } from './strings/QualityList.strings';

const FIGURES = 'grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6';

function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <p className="h-4 truncate text-xs text-muted">{label}</p>
      <p className="h-5 text-sm font-semibold tabular-nums">{value}</p>
      <p className="h-4 truncate text-xs text-muted tabular-nums">{detail ?? ''}</p>
    </div>
  );
}

const rateDetail = (r: CardRate | null) => (r ? interval(r) : '');

/** Who marked it: flags and leeches, without the ones that are 0. */
const marks = (r: QualityRow) =>
  [r.flagged ? s.flagged(r.flagged) : null, r.leeches ? s.leeches(r.leeches) : null]
    .filter(Boolean)
    .join(' · ');

function Row({ row: r }: { row: QualityRow }) {
  const head = (
    <>
      {/* The front arrives with its assessment's index, in a line already there. */}
      <span className="block h-5 truncate text-sm">{r.text ?? r.code ?? ''}</span>
      <span className="block h-4 truncate text-xs text-muted">
        {[r.code, r.version === null ? null : s.version(r.version), r.deckLabel]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </>
  );
  return (
    <li className="px-4 py-3 sm:px-5">
      {r.explorer ? (
        <Link to={r.explorer} className="block rounded-md hover:text-brand hover:underline">
          {head}
        </Link>
      ) : (
        <div>{head}</div>
      )}
      <p className="mt-1 flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        {r.reasons.map((reason) => (
          <span
            key={reason}
            className="rounded-full bg-[#c2410c]/8 px-2 leading-5 text-[#c2410c] dark:text-[#f0875a]"
          >
            {reasonText(reason)}
          </span>
        ))}
        {marks(r) ? <span className="text-muted">{marks(r)}</span> : null}
        {r.openReports ? (
          <Link to={paths.adminReports} className="font-medium text-brand hover:underline">
            {s.reports(r.openReports)}
          </Link>
        ) : null}
      </p>
      <div className={`${FIGURES} mt-2`}>
        <Figure label={s.figures.students} value={String(r.students)} />
        <Figure
          label={s.figures.first}
          value={rateText(r.firstView)}
          detail={rateDetail(r.firstView)}
        />
        <Figure
          label={s.figures.reviews}
          value={rateText(r.reviews)}
          detail={rateDetail(r.reviews)}
        />
        <Figure
          label={s.figures.expected}
          value={r.predicted ? percent(r.predicted.expected) : rateText(null)}
          detail={r.predicted ? s.of(r.predicted.n) : ''}
        />
        <Figure label={s.figures.time} value={seconds(r.medianMs)} />
        <Figure label={s.figures.hidden} value={String(r.suspended)} detail={s.buried(r.buried)} />
      </div>
    </li>
  );
}

export function QualityList({
  rows,
  loading,
  empty,
  label,
}: {
  rows: QualityRow[];
  loading: boolean;
  empty: string;
  label: string;
}) {
  if (loading) {
    return (
      <div className={`${card} mt-3 space-y-3 p-4 sm:p-5`} aria-hidden="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (!rows.length) {
    return <p className={`${card} mt-3 px-4 py-3 text-sm text-muted sm:px-5`}>{empty}</p>;
  }
  return (
    <ol aria-label={label} className={`${card} mt-3 divide-y divide-border`}>
      {rows.map((r) => (
        <Row key={`${r.noteGuid}:${String(r.ord)}`} row={r} />
      ))}
    </ol>
  );
}
