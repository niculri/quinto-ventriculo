// Quick search (⌘K / Ctrl+K or «/»): results while typing, arrows to move and Enter to open.
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, LoaderCircle, Search } from 'lucide-react';
import { BlurredBackdrop } from '../../../shared/ui/Dialog';
import { usePalette } from '../hooks/usePalette';
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
  const palette = usePalette(close);
  const { text, type, selected, results, isFetching, typed, go, seeAll } = palette;
  return (
    <div onKeyDown={palette.onKeyDown}>
      <div className="flex items-center gap-3 border-b border-border px-4">
        {isFetching ? (
          <LoaderCircle className="size-5 animate-spin text-muted" aria-hidden="true" />
        ) : (
          <Search className="size-5 text-muted" aria-hidden="true" />
        )}
        <input
          autoFocus
          value={text}
          onChange={(e) => type(e.target.value)}
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
        <PaletteResults palette={palette} />
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
