// The parts of a row of the deck list: what is left today, the cards seen with their bar, the fold and «Estudiar»
// (which, on something off, turns it on first).

import { Link } from 'react-router';
import { ChevronRight, Play } from 'lucide-react';
import type { Counts } from '@qv/srs';
import { estimateMinutes, minutesText, totalCards } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import type { DeckRef } from '../../../shared/lib/paths';
import { preloadOnIntent } from '../../../shared/lib/preload';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { button } from '../../../shared/ui/styles';
import { deckTreeRowStrings as s } from './strings/DeckTreeRow.strings';

/** «Hoy: 12 nuevas · 15 repasos · ~8 min» (repasos are learning and due ones), «Listo por hoy» or «Sin activar». */
export function RowToday({
  counts,
  medianAnswerMs,
  off,
  lookOnly,
}: {
  counts: Counts | undefined;
  medianAnswerMs: number | null;
  off: boolean;
  /** Only the draft has it: there is nothing to study, so no load is waited for. */
  lookOnly: boolean;
}) {
  if (lookOnly) return <span className="text-muted">{s.tree.lookOnly}</span>;
  if (!counts) return <Skeleton className="inline-block h-4 w-40 align-middle" />;
  if (totalCards(counts) === 0) {
    return <span className="text-muted">{off ? s.tree.nothingOn : s.tree.done}</span>;
  }
  const reviews = counts.learning + counts.review;
  const number = (x: number, color: string) => (
    <strong className={`font-semibold ${color}`}>{x.toLocaleString('es-CL')}</strong>
  );
  return (
    <span className="tabular-nums">
      {s.tree.today}
      {counts.new > 0 ? (
        <>
          {number(counts.new, 'text-state-new')}
          {s.tree.news(counts.new)}
          {s.tree.sep}
        </>
      ) : null}
      {reviews > 0 ? (
        <>
          {number(reviews, 'text-state-review')}
          {s.tree.reviews(reviews)}
          {s.tree.sep}
        </>
      ) : null}
      {minutesText(estimateMinutes(counts, medianAnswerMs))}
    </span>
  );
}

/** «Vistas X de Y» (or «Y tarjetas» before the first), a week's «N de M videos activados», and a thin bar. */
export function RowSeen({
  seen,
  videos,
  videosId,
}: {
  seen: { seen: number; total: number } | undefined;
  videos: { on: number; total: number } | null;
  videosId: string;
}) {
  const partial = videos && videos.on > 0 && videos.on < videos.total;
  const longest = `${s.tree.seen(seen?.total ?? 0, seen?.total ?? 0)}${
    videos ? `${s.tree.sep}${s.tree.videosOn(videos.total, videos.total)}` : ''
  }`;
  const percent = seen && seen.total > 0 ? (100 * seen.seen) / seen.total : 0;
  return (
    <>
      <Reserved longest={longest} className="text-xs text-muted">
        {seen ? (
          <span className="tabular-nums">
            {seen.seen > 0 ? s.tree.seen(seen.seen, seen.total) : s.tree.cards(seen.total)}
            {partial ? s.tree.sep : null}
            {/* Always in the page, so the week's switch can be described by it. */}
            <span id={videosId} className={partial ? '' : 'hidden'}>
              {videos ? s.tree.videosOn(videos.on, videos.total) : null}
            </span>
          </span>
        ) : (
          <Skeleton className="inline-block h-3 w-28 align-middle" />
        )}
      </Reserved>
      <span aria-hidden="true" className="mt-1 block h-1 w-full max-w-56 rounded-full bg-border">
        <span className="block h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </span>
    </>
  );
}

export function FoldButton({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={s.tree.fold(open, label)}
      className="flex size-6 flex-none items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-ink"
    >
      <ChevronRight
        className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}

/** A link, or a button when it has to turn the deck on before going to study it. */
export function StudyButton({
  deck,
  label,
  turnsOn,
  busy,
  onStudy,
}: {
  deck: DeckRef;
  label: string;
  turnsOn: boolean;
  busy: boolean;
  onStudy: () => void;
}) {
  const className = `${button.base} ${button.ghost} flex-none px-2`;
  const icon = <Play className="size-4" aria-hidden="true" />;
  if (!turnsOn) {
    return (
      <Link
        to={paths.deckStudy(deck)}
        {...preloadOnIntent('anki-study')}
        className={className}
        aria-label={s.tree.study(label)}
        title={s.tree.studyTitle}
      >
        {icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onStudy}
      disabled={busy}
      aria-busy={busy}
      {...preloadOnIntent('anki-study')}
      className={className}
      aria-label={s.tree.turnOnAndStudy(label)}
      title={s.tree.turnOnAndStudyTitle}
    >
      {icon}
    </button>
  );
}
