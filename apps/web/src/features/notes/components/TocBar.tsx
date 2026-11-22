// The index bar of a narrow screen, fixed under the site's bar: the section being read, the reading progress and the
// panel with the whole index.
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { ChevronDown, ListTree } from 'lucide-react';
import type { TocEntry } from '@qv/schema';
import { Toc } from './Toc';
import { tocBarStrings } from './strings/TocBar.strings';

export function TocBar({
  bar,
  toc,
  active,
  progress,
  current,
  open,
  setOpen,
}: {
  bar: RefObject<HTMLDivElement | null>;
  toc: TocEntry[];
  active: string | null;
  progress: number;
  current: string | null;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    // The `before:` strip covers the gap with the site's bar, so the text does not show through.
    <div
      ref={bar}
      className="sticky top-[4.5rem] z-30 mb-6 before:absolute before:inset-x-0 before:bottom-full before:h-2 before:bg-bg xl:hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="toc-panel"
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface/95 px-3 py-2 text-left text-sm shadow-xs backdrop-blur"
      >
        <ListTree className="size-4 flex-none text-muted" aria-hidden="true" />
        <span className="flex-none font-medium text-ink">{tocBarStrings.index}</span>
        {current ? (
          <span className="min-w-0 truncate text-muted" aria-hidden="true">
            · {current}
          </span>
        ) : null}
        <ChevronDown
          className={`ml-auto size-4 flex-none text-muted transition ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div className="absolute inset-x-0 h-0.5 overflow-hidden rounded-full" aria-hidden="true">
        <div className="h-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {open ? (
        <div
          id="toc-panel"
          data-toc-scroll
          className="absolute inset-x-0 mt-2 max-h-[65dvh] overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-soft"
        >
          <Toc toc={toc} active={active} expandAll onSelect={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
