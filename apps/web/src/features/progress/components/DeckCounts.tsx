// The lines that show what is left today in a deck: the load in minutes (with its breakdown) and the three counts.

import { useId, useState } from 'react';
import type { Counts } from '@qv/srs';
import { breakdownText, loadText, totalCards } from '@qv/study';
import { tapArea } from '../../../shared/ui/styles';
import { useHoverOpen } from '../hooks/useHoverOpen';
import { useOutsideClose } from '../hooks/useOutsideClose';
import { deckCountsStrings as s } from './strings/DeckCounts.strings';

// From `sm` up the breakdown goes beside the text, never under it: to the left in a list (over the name, so the loads
// of the rows around stay in view), or to the right where the left is a button (over nothing that can be clicked).
const SIDE = {
  left: 'sm:right-full sm:left-auto sm:mr-2',
  right: 'sm:left-full sm:ml-2',
} as const;

export function DayLoad({
  counts,
  medianAnswerMs,
  detail = false,
  side = 'left',
  empty = s.nothingToday,
  className = '',
}: {
  counts: Counts;
  medianAnswerMs: number | null;
  detail?: boolean;
  side?: keyof typeof SIDE;
  empty?: string;
  className?: string;
}) {
  const text = totalCards(counts) === 0 ? empty : loadText(counts, medianAnswerMs);
  const breakdown = breakdownText(counts);
  if (!detail || totalCards(counts) === 0) {
    return (
      <span className={`tabular-nums ${className}`} title={breakdown}>
        {text}
        <span className="sr-only"> ({breakdown})</span>
      </span>
    );
  }
  return (
    <LoadWithBreakdown
      text={text}
      breakdown={breakdown}
      counts={counts}
      side={side}
      className={className}
    />
  );
}

function LoadWithBreakdown({
  text,
  breakdown,
  counts,
  side,
  className,
}: {
  text: string;
  breakdown: string;
  counts: Counts;
  side: keyof typeof SIDE;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useOutsideClose(open, setOpen);
  const hover = useHoverOpen(setOpen);
  const breakdownId = useId();
  const row = (label: string, value: number, color: string) => (
    <span className="flex justify-between gap-4">
      <span className={color}>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
  // A screen reader hears the breakdown with the button, without opening it: the box is hidden until it opens.
  return (
    <span ref={boxRef} className="relative inline-flex">
      <span id={breakdownId} hidden>
        {breakdown}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={breakdownId}
        {...hover}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        className={`${tapArea} cursor-pointer rounded tabular-nums underline decoration-border-strong decoration-dotted underline-offset-4 hover:decoration-current ${className}`}
      >
        {text}
      </button>
      <span
        role="status"
        className={`pointer-events-none absolute top-full left-0 z-30 mt-1 w-44 flex-col gap-1 rounded-lg border border-border bg-surface p-2.5 text-left text-xs font-normal text-ink shadow-soft sm:top-1/2 sm:mt-0 sm:-translate-y-1/2 ${SIDE[side]} ${open ? 'flex' : 'hidden'}`}
      >
        {row(s.new, counts.new, 'text-state-new')}
        {row(s.learning, counts.learning, 'text-state-learn')}
        {row(s.review, counts.review, 'text-state-review')}
      </span>
    </span>
  );
}

export function CountNumbers({
  counts,
  current,
  className = '',
}: {
  counts: Counts;
  current?: 'new' | 'learning' | 'review' | null;
  className?: string;
}) {
  const part = (
    kind: 'new' | 'learning' | 'review',
    value: number,
    color: string,
    label: string,
  ) => (
    <span
      className={`${color} tabular-nums ${current === kind ? 'underline decoration-2 underline-offset-4' : ''}`}
      title={label}
    >
      <span className="sr-only">
        {label}
        {s.labelOf}
      </span>
      {value}
    </span>
  );
  return (
    <span className={`items-center gap-1.5 font-semibold ${className || 'inline-flex'}`}>
      {part('new', counts.new, 'text-state-new', s.new)}
      <span className="text-muted" aria-hidden="true">
        +
      </span>
      {part('learning', counts.learning, 'text-state-learn', s.learning)}
      <span className="text-muted" aria-hidden="true">
        +
      </span>
      {part('review', counts.review, 'text-state-review', s.review)}
    </span>
  );
}
