import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, FileText, LoaderCircle, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { countSearch } from '../usage/count';
import { useCatalog } from '../catalog/queries';
import { Snippet } from './Snippet';
import { resultLink, searchContext, useSearch } from './useSearch';

/** Quick search (⌘K / Ctrl+K or «/»): results while typing, arrows to move and Enter to open. */
export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[10vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        >
          <Dialog.Title className="sr-only">Buscar en la página</Dialog.Title>
          {open ? <PaletteContent close={() => onOpenChange(false)} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteContent({ close }: { close: () => void }) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const catalog = useCatalog().data;
  const { pathname } = useLocation();
  const { api } = useServices();
  const { results, active, isFetching, query } = useSearch(text, 8);
  // Opening a result or «Ver todos» (with the mouse or Enter) completes the search: «Uso» counts it once (step 2.9).
  const go = (to: string) => {
    countSearch(api, text, searchContext(pathname));
    close();
    navigate(to);
  };
  const seeAll = paths.search(text);
  const typed = text.trim().length >= 2;
  // While waiting for the query to settle we do not say «nothing»: it has not been searched yet.
  const noResults = active && query === text.trim() && !isFetching && results.length === 0;

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelected((i) => Math.max(0, Math.min(i + 1, results.length - 1)));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelected((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && text.trim()) {
          e.preventDefault();
          const r = results[selected];
          go(r ? resultLink(r, catalog) : seeAll);
        }
      }}
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        {isFetching ? (
          <LoaderCircle className="size-5 animate-spin text-muted" aria-hidden="true" />
        ) : (
          <Search className="size-5 text-muted" aria-hidden="true" />
        )}
        <input
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSelected(0);
          }}
          placeholder="Busca un concepto: nucléolo, splicing, GPCR…"
          aria-label="Buscar en la página"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="palette-results"
          aria-autocomplete="list"
          aria-activedescendant={results[selected] ? `palette-result-${selected}` : undefined}
          className="h-14 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[0.7rem] text-muted">
          Esc
        </kbd>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {!typed ? (
          <p className="px-3 py-8 text-center text-sm text-muted">Escribe al menos dos letras.</p>
        ) : noResults ? (
          <p className="px-3 py-8 text-center text-sm text-muted">
            Nada para «{query}». Prueba con otra palabra o sin abreviaturas.
          </p>
        ) : (
          <ul id="palette-results" role="listbox" aria-label="Resultados">
            {results.map((r, i) => (
              <li
                key={`${r.noteId}-${r.anchor}`}
                id={`palette-result-${i}`}
                role="option"
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={() => go(resultLink(r, catalog))}
                className={`flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 ${i === selected ? 'bg-surface-2' : ''}`}
              >
                <FileText className="mt-0.5 size-4 flex-none text-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.section}
                    <span className="font-normal text-muted"> · {r.noteTitle}</span>
                  </p>
                  <p className="line-clamp-2 text-[0.82rem] leading-snug text-muted">
                    <Snippet text={r.snippet} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {typed ? (
        <button
          type="button"
          onClick={() => go(seeAll)}
          className="flex w-full items-center justify-between border-t border-border px-5 py-3 text-sm text-muted hover:bg-surface-2 hover:text-ink"
        >
          Ver todos los resultados
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
