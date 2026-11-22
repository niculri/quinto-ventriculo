// What the cards of a note are for the student: a dot per card (seen, new, hard, hidden), a flag if one is marked,
// and the same in words.
import { Flag } from 'lucide-react';
import type { CardStatus, ExplorerCard } from '../model/explorer';
import type { Matched } from '../model/filters';
import { cardStatusStrings } from './strings/CardStatus.strings';

export function statusText(cards: readonly ExplorerCard[]): string {
  const by = new Map<CardStatus, number>();
  for (const c of cards) by.set(c.status, (by.get(c.status) ?? 0) + 1);
  const parts = (['new', 'seen', 'hard', 'hidden'] as const)
    .filter((s) => by.get(s))
    .map((s) => `${by.get(s)} ${cardStatusStrings.list.status[s][by.get(s)! === 1 ? 0 : 1]}`);
  const marked = cards.filter((c) => c.marked).length;
  if (marked) parts.push(cardStatusStrings.list.marked(marked));
  return cardStatusStrings.list.statusLine(cards.length, parts);
}

export function StatusDot({ status }: { status: CardStatus }) {
  switch (status) {
    case 'new':
      return <span className="block size-2.5 rounded-full border-[1.5px] border-muted" />;
    case 'seen':
      return <span className="block size-2.5 rounded-full bg-brand" />;
    case 'hard':
      return (
        <svg viewBox="0 0 10 10" className="block size-2.5 text-accent">
          <path d="M5 0.5 9.6 9.3H0.4Z" fill="currentColor" />
        </svg>
      );
    case 'hidden':
      return <span className="block h-0.5 w-2.5 rounded bg-muted" />;
  }
}

const MAX_DOTS = 8;

export function Dots({ m }: { m: Matched }) {
  const all = m.note.cards;
  const shown = all.slice(0, MAX_DOTS);
  const on = new Set(m.cards.map((c) => c.key));
  return (
    <span className="flex flex-none items-center gap-1" aria-hidden="true">
      {all.some((c) => c.marked) ? <Flag className="size-3 fill-current text-brand" /> : null}
      {shown.map((c) => (
        <span key={c.key} className={on.has(c.key) ? '' : 'opacity-35'}>
          <StatusDot status={c.status} />
        </span>
      ))}
      {all.length > MAX_DOTS ? (
        <span className="text-[0.6875rem] text-muted tabular-nums">+{all.length - MAX_DOTS}</span>
      ) : null}
    </span>
  );
}
