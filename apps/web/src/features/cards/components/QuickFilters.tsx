// One-click filters over the table's search (a card state, «Marcadas»), written into it in Anki's syntax.

import { Fragment } from 'react';
import { Flag } from 'lucide-react';
import { cardsStrings } from '../strings';

const STATES = [
  // Not «Para hoy»: `is:due` has no new cards, and on the deck pages «62 para hoy» counts them.
  { label: cardsStrings.quick.states.due, term: 'is:due' },
  { label: cardsStrings.quick.states.new, term: 'is:new' },
  { label: cardsStrings.quick.states.learn, term: 'is:learn' },
  { label: cardsStrings.quick.states.review, term: 'is:review' },
  { label: cardsStrings.quick.states.buried, term: 'is:buried' },
  { label: cardsStrings.quick.states.suspended, term: 'is:suspended' },
] as const;

const MARKED = '-flag:0';

/** A term of the search, outside quotes as far as a filter of these needs: alone between spaces. */
const termRegex = (term: string) => new RegExp(`(^|\\s)${term.replace(/[-:]/g, '\\$&')}(?=\\s|$)`);

const has = (query: string, term: string) => termRegex(term).test(query);
const without = (query: string, term: string) =>
  query.replace(termRegex(term), ' ').replace(/\s+/g, ' ').trim();

export function QuickFilters({
  query,
  onSearch,
}: {
  query: string;
  onSearch: (q: string) => void;
}) {
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      on
        ? 'border-brand/40 bg-brand-soft text-brand'
        : 'border-border text-muted hover:bg-surface-2 hover:text-ink'
    }`;
  const toggleState = (term: string) => {
    const on = has(query, term);
    const base = STATES.reduce((q, s) => without(q, s.term), query);
    onSearch(on ? base : `${base} ${term}`);
  };
  const marked = has(query, MARKED);
  return (
    <div className="mt-3">
      <div role="group" aria-label={cardsStrings.quick.label} className="flex flex-wrap gap-1.5">
        {STATES.map((s) => (
          <button
            key={s.term}
            type="button"
            aria-pressed={has(query, s.term)}
            onClick={() => toggleState(s.term)}
            className={chip(has(query, s.term))}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={marked}
          onClick={() => onSearch(marked ? without(query, MARKED) : `${query} ${MARKED}`)}
          className={chip(marked)}
        >
          <Flag className="size-3" aria-hidden="true" /> {cardsStrings.quick.marked}
        </button>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">{cardsStrings.quick.advanced}</summary>
        <p className="mt-1.5 max-w-2xl leading-relaxed">
          {cardsStrings.quick.help}
          {cardsStrings.quick.examples.map(([code, after]) => (
            <Fragment key={code}>
              <code>{code}</code>
              {after}
            </Fragment>
          ))}
        </p>
      </details>
    </div>
  );
}
