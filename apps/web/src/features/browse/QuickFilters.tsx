import { Flag } from 'lucide-react';

/** The state of a card, one at a time. */
const STATES = [
  // Not «Para hoy»: `is:due` has no new cards, and on the deck pages «62 para hoy» counts them.
  { label: 'A repasar hoy', term: 'is:due' },
  { label: 'Nuevas', term: 'is:new' },
  { label: 'Aprendiendo', term: 'is:learn' },
  { label: 'En repaso', term: 'is:review' },
  { label: 'Saltadas', term: 'is:buried' },
  { label: 'Ocultas', term: 'is:suspended' },
] as const;

const MARKED = '-flag:0';

/** A term of the search, outside quotes as far as a filter of these needs: alone between spaces. */
const termRegex = (term: string) => new RegExp(`(^|\\s)${term.replace(/[-:]/g, '\\$&')}(?=\\s|$)`);

const has = (query: string, term: string) => termRegex(term).test(query);
const without = (query: string, term: string) =>
  query.replace(termRegex(term), ' ').replace(/\s+/g, ' ').trim();

/**
 * One click instead of Anki's syntax: the state and «Marcadas», over whatever the search has (a deck, a text).
 * The syntax is still what the search understands, and what a filter writes in it.
 */
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
      <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap gap-1.5">
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
          <Flag className="size-3" aria-hidden="true" /> Marcadas
        </button>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">Búsqueda avanzada</summary>
        <p className="mt-1.5 max-w-2xl leading-relaxed">
          El buscador entiende la sintaxis de Anki. Por ejemplo: <code>vértebra atlas</code> (las
          dos palabras), <code>&quot;arco del atlas&quot;</code> (la frase), <code>-axis</code> (sin
          esa palabra), <code>tag:profe</code>, <code>deck:&quot;…&quot;</code>, <code>is:due</code>
          , <code>rated:7:1</code> (las que fallaste en 7 días), <code>prop:lapses&gt;3</code> y{' '}
          <code>A OR B</code>.
        </p>
      </details>
    </div>
  );
}
