// The student's cards of the scope by state: one bar in the site's turquoise, from new (grey) to mature, and the count
// of each; the advanced mode splits learning and hidden.

import type { CardStatsData } from '@qv/study';
import { stateBreakdown } from '@qv/study';
import { Skeleton } from '../../../shared/ui/Loading';
import { STATE_COLORS } from '../model/shades';
import { cardStatesStrings as s } from './strings/CardStates.strings';

const ORDER = ['mature', 'young', 'learning', 'new', 'hidden'] as const;

export function CardStates({
  cards,
  total,
  advanced,
}: {
  cards: CardStatsData['cards'] | null;
  total: number;
  advanced: boolean;
}) {
  const b = cards ? stateBreakdown(cards, total) : null;
  const sum = b
    ? Math.max(
        1,
        ORDER.reduce((t, k) => t + b[k], 0),
      )
    : 1;
  const extras: Partial<Record<(typeof ORDER)[number], readonly [string, string]>> = cards
    ? {
        learning: s.learningSplit(cards.learning, cards.relearning),
        hidden: s.hiddenSplit(cards.suspended, cards.buried),
      }
    : {};
  return (
    <div>
      <p className="h-6 font-medium tabular-nums">
        {b ? s.seen(b.seen, total) : <Skeleton className="h-5 w-48" />}
      </p>
      <div
        role="img"
        aria-label={s.bar}
        className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2"
      >
        {b
          ? ORDER.map((k) =>
              b[k] > 0 ? (
                <span
                  key={k}
                  style={{ width: `${(b[k] / sum) * 100}%`, background: STATE_COLORS[k] }}
                />
              ) : null,
            )
          : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {ORDER.map((k) => (
          <div key={k} className="min-w-0">
            <dt className="flex items-center gap-1.5 truncate text-xs text-muted">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 flex-none rounded-sm border border-border"
                style={{ background: STATE_COLORS[k] }}
              />
              {s.states[k]}
            </dt>
            <dd className="mt-0.5 h-6 text-base font-semibold tabular-nums">
              {b ? s.count(b[k]) : <Skeleton className="h-5 w-12" />}
            </dd>
            {advanced ? (
              <dd className="h-8 text-xs leading-4 text-muted tabular-nums">
                {extras[k]?.map((line) => (
                  <span key={line} className="block truncate">
                    {line}
                  </span>
                ))}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">{s.hint(advanced)}</p>
    </div>
  );
}
