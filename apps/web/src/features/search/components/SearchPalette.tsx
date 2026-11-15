// Quick search (⌘K / Ctrl+K or «/»): results while typing, arrows to move and Enter to open.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, LoaderCircle, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { useApi } from '../../../shared/hooks/useApi';
import { BlurredBackdrop } from '../../../shared/ui/Dialog';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { countSearch } from '../../usage/count';
import { useSearch } from '../hooks/useSearch';
import { resultLink, searchContext } from '../model/results';
import { PaletteResults } from './PaletteResults';
import { paletteStrings as s } from '../palette.strings';

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
        <BlurredBackdrop />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[10vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        >
          <Dialog.Title className="sr-only">{s.title}</Dialog.Title>
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
  const api = useApi();
  const { results, active, isFetching, query } = useSearch(text, 8);
  const go = (to: string) => {
    countSearch(api, text, searchContext(pathname));
    close();
    void navigate(to);
  };
  const seeAll = paths.search(text);
  const typed = text.trim().length >= 2;
  // Not «nothing» while the debounced query has not caught up with the text.
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
          placeholder={s.placeholder}
          aria-label={s.title}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="palette-results"
          aria-autocomplete="list"
          aria-activedescendant={results[selected] ? `palette-result-${selected}` : undefined}
          className="h-14 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[0.7rem] text-muted">
          {s.escape}
        </kbd>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {!typed ? (
          <p className="px-3 py-8 text-center text-sm text-muted">{s.twoLetters}</p>
        ) : noResults ? (
          <p className="px-3 py-8 text-center text-sm text-muted">
            {s.nothingFor}
            {query}
            {s.nothingAfter}
          </p>
        ) : (
          <PaletteResults
            results={results}
            selected={selected}
            onSelect={setSelected}
            onOpen={(r) => go(resultLink(r, catalog))}
          />
        )}
      </div>

      {typed ? (
        <button
          type="button"
          onClick={() => go(seeAll)}
          className="flex w-full items-center justify-between border-t border-border px-5 py-3 text-sm text-muted hover:bg-surface-2 hover:text-ink"
        >
          {s.seeAll}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
