// The ten cards of the scope the student forgets most often, each with its code, its front and how many times it was
// forgotten, and a link to it in the cards explorer; at the end, every hard card there.

import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { cardParam } from '../../cards/model/urlState';
import type { HardCardRow } from '../model/hardCards';
import { hardCardsStrings as s } from './strings/HardCards.strings';

export function HardCards({
  node,
  rows,
  loading,
  deckLabel,
}: {
  node: CourseDeckNode;
  rows: HardCardRow[];
  loading: boolean;
  deckLabel: (deckId: string) => string;
}) {
  if (loading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (!rows.length) return <p className="text-sm text-muted">{s.none}</p>;
  return (
    <>
      <ol className="divide-y divide-border">
        {rows.map((r) => {
          const what = r.code ?? r.text ?? s.noText;
          return (
            <li key={`${r.noteGuid}:${String(r.ord)}`}>
              <Link
                to={paths.cards(node.ref, { card: cardParam(r) })}
                aria-label={s.open(what)}
                className="-mx-2 flex h-14 items-center gap-3 rounded-lg px-2 hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  {/* The front arrives with its assessment's index, in a line already there. */}
                  <span className="block h-5 truncate text-sm">{r.text}</span>
                  <span className="block h-4 truncate text-xs text-muted">
                    {[r.code, deckLabel(r.deckId)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="flex-none text-right text-xs tabular-nums">
                  <span className="block font-semibold text-sm">{s.lapses(r.lapses)}</span>
                  <span className="block text-muted">{s.reps(r.reps)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="mt-3">
        <Link
          to={paths.cards(node.ref, { state: 'hard' })}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          {s.all} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </p>
    </>
  );
}
