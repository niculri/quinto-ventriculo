import { useEffect, useMemo, useRef, useState } from 'react';
import type { Counts, QueueCard } from '@qv/srs';
import type { DeckDetail } from '@qv/schema';
import { useStudyData } from './queries';
import { buildQueue, configsFor, deckIds, queueCards, studiedToday } from './scheduler';
import type { StudyData } from './scheduler';
import { masteryByDeck } from './mastery';
import { breakdownText, loadText, totalCards } from './simple';

/**
 * Each deck of the studied deck's tree with what is left today, as Anki's deck list counts it: the same
 * limits through the tree as the study queue, but without burying siblings (compared with Anki in
 * packages/srs/test/queue-tree.test.ts). The subdecks add up in their parent. In simple mode, as the study
 * queue: «62 para hoy» has to be what comes out.
 */
export function deckCounts(data: StudyData, nowMs = Date.now()): Map<string, Counts> {
  const configs = configsFor(data, nowMs);
  const studied = studiedToday(data.answers, data.decks);
  const cards = queueCards(data, nowMs);
  const ids = deckIds(data.deck);
  const wanted = new Set(ids);
  // Each deck's own cards, then the cards of its subtree gathered child by child: with hundreds of decks and
  // tens of thousands of cards, filtering every card for every deck took seconds (a deck's queue only sees
  // the cards below it, so this is the same queue).
  const own = new Map<string, QueueCard[]>();
  for (const c of cards) {
    const list = own.get(c.deckId);
    if (list) list.push(c);
    else own.set(c.deckId, [c]);
  }
  const children = new Map<string, string[]>();
  for (const d of data.decks) {
    if (d.parentId === null || !wanted.has(d.id)) continue;
    const list = children.get(d.parentId);
    if (list) list.push(d.id);
    else children.set(d.parentId, [d.id]);
  }
  const inside = new Map<string, QueueCard[]>();
  const gather = (id: string): QueueCard[] => {
    const done = inside.get(id);
    if (done) return done;
    const parts = [own.get(id) ?? [], ...(children.get(id) ?? []).map(gather)];
    // In the order of the deck's card list, as the queue was always given them.
    const list = parts.length === 1 ? parts[0]! : parts.flat().sort((a, b) => a.index - b.index);
    inside.set(id, list);
    return list;
  };
  const out = new Map<string, Counts>();
  const known = new Set(data.decks.map((d) => d.id));
  for (const id of ids) {
    if (!known.has(id)) continue;
    out.set(id, buildQueue(data, id, nowMs, configs, studied, gather(id)).counts());
  }
  return out;
}

/**
 * When the counts can change by themselves: a learning step of today coming within the learn-ahead limit, or a card
 * buried until a moment that passes. Null: not before the day changes (the study data are read again then).
 */
export function nextCountChange(data: StudyData, nowMs = Date.now()): number | null {
  const ahead = data.prefs.learnAheadMinutes * 60_000;
  let next: number | null = null;
  const consider = (at: number) => {
    if (at > nowMs && (next === null || at < next)) next = at;
  };
  for (const r of data.rows.values()) {
    if (r.phase !== 'new' && !r.interday && r.due !== null) consider(Date.parse(r.due) - ahead);
    if (r.buriedUntil !== null) consider(Date.parse(r.buriedUntil));
  }
  return next;
}

export function useDeckCounts(deck: DeckDetail | undefined) {
  const study = useStudyData(deck);
  // Computed when something changed or a card came due (plan step 3.2, E6), not every minute.
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

/**
 * «62 para hoy · ~20 min». With `detail`, it opens the breakdown (with the pointer over it or with a touch);
 * without it (inside a link), the breakdown is its tooltip.
 */
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
  /** What it says with nothing left. */
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
        className={`cursor-pointer rounded tabular-nums underline decoration-border-strong decoration-dotted underline-offset-4 hover:decoration-current ${className}`}
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

/** «20 + 3 + 5» in Anki's colors: new, learning, to review. */
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
