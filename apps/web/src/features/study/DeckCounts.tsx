// What is left today in each deck of a tree, as Anki's deck list counts it, and the lines that show it.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Counts } from '@qv/srs';
import type { DeckDetail } from '@qv/schema';
import {
  breakdownText,
  deckCounts,
  loadText,
  masteryByDeck,
  nextCountChange,
  totalCards,
} from '@qv/study';
import { useStudyData } from './queries';
import { tapArea } from '../../ui/styles';

export function useDeckCounts(deck: DeckDetail | undefined) {
  const study = useStudyData(deck);
  // Computed when something changed or a card came due, not every minute.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!study.data) return;
    const at = nextCountChange(study.data);
    if (at === null) return;
    const id = setTimeout(() => setTick((t) => t + 1), Math.min(at - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [study.data, tick]);
  const counts = useMemo(() => {
    void tick;
    return study.data ? deckCounts(study.data) : undefined;
  }, [study.data, tick]);
  const mastery = useMemo(() => {
    void tick;
    return study.data ? masteryByDeck(study.data) : undefined;
  }, [study.data, tick]);
  return { ...study, counts, mastery };
}

export function DayLoad({
  counts,
  medianAnswerMs,
  detail = false,
  empty = 'Nada para hoy',
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
  const box = useRef<HTMLSpanElement>(null);
  // A touch elsewhere closes it (a phone does not focus a button, so it never gets a blur).
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const row = (label: string, value: number, color: string) => (
    <span className="flex justify-between gap-4">
      <span className={color}>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
  return (
    <span ref={box} className="group relative inline-flex">
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
        {row('Nuevas', counts.new, 'text-state-new')}
        {row('Aprendiendo', counts.learning, 'text-state-learn')}
        {row('A repasar', counts.review, 'text-state-review')}
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
      <span className="sr-only">{label}: </span>
      {value}
    </span>
  );
  return (
    <span className={`items-center gap-1.5 font-semibold ${className || 'inline-flex'}`}>
      {part('new', counts.new, 'text-state-new', 'Nuevas')}
      <span className="text-muted" aria-hidden="true">
        +
      </span>
      {part('learning', counts.learning, 'text-state-learn', 'Aprendiendo')}
      <span className="text-muted" aria-hidden="true">
        +
      </span>
      {part('review', counts.review, 'text-state-review', 'A repasar')}
    </span>
  );
}
