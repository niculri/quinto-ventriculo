// The lines that show what is left today in a deck: the load in minutes (with its breakdown) and the three counts.

import { useState } from 'react';
import type { Counts } from '@qv/srs';
import { breakdownText, loadText, totalCards } from '@qv/study';
import { tapArea } from '../../../shared/ui/styles';
import { useOutsideClose } from '../hooks/useOutsideClose';
import { deckCountsStrings as s } from './strings/DeckCounts.strings';

export function DayLoad({
  counts,
  medianAnswerMs,
  detail = false,
  empty = s.nothingToday,
  className = '',
}: {
  counts: Counts;
  medianAnswerMs: number | null;
  detail?: boolean;
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
  return <LoadWithBreakdown text={text} counts={counts} className={className} />;
}

function LoadWithBreakdown({
  text,
  counts,
  className,
}: {
  text: string;
  counts: Counts;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useOutsideClose(open, setOpen);
  const row = (label: string, value: number, color: string) => (
    <span className="flex justify-between gap-4">
      <span className={color}>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
  return (
    <span ref={boxRef} className="group relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${tapArea} cursor-pointer rounded tabular-nums underline decoration-border-strong decoration-dotted underline-offset-4 hover:decoration-current ${className}`}
      >
        {text}
      </button>
      <span
        role="status"
        className={`absolute top-full right-0 z-30 mt-1 w-44 flex-col gap-1 rounded-lg border border-border bg-surface p-2.5 text-left text-xs font-normal text-ink shadow-soft group-hover:flex ${open ? 'flex' : 'hidden'}`}
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
