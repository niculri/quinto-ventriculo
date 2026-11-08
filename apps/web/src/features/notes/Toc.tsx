import { useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { TocEntry } from '@qv/schema';

/**
 * The article's table of contents: every h2, and the h3 of the one being read (the rest folded, as Kenhub's),
 * with the section being read marked and a bar with how much has been read, and «Volver al inicio» first of all.
 */
export function Toc({
  toc,
  active,
  progress,
  onSelect,
  expandAll = false,
}: {
  toc: TocEntry[];
  active: string | null;
  progress?: number;
  onSelect?: () => void;
  /** Every h3 visible (the phone's panel, which opens over the text). */
  expandAll?: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const navigate = useNavigate();
  const activeH2 = activeLevel2(toc, active);
  const groups = groupByLevel2(toc);

  // The marked entry stays in sight inside the sticky column (without moving the page).
  useEffect(() => {
    const ol = list.current;
    const scroller = ol?.closest<HTMLElement>('[data-toc-scroll]');
    const item = ol?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!scroller || !item) return;
    // Where the entry is in the column's visible part.
    const y = item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (y < 40 || y > scroller.clientHeight - 60) {
      scroller.scrollTop = Math.max(0, scroller.scrollTop + y - scroller.clientHeight / 3);
    }
  }, [active]);

  const toTop = () => {
    onSelect?.();
    // Without the section's #anchor, so that reloading does not jump back to it.
    if (window.location.hash) {
      void navigate(
        { search: window.location.search, hash: '' },
        { replace: true, preventScrollReset: true },
      );
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  if (!toc.length) return null;
  return (
    <nav aria-label="Índice del artículo">
      <button
        type="button"
        onClick={toTop}
        className="mb-3 inline-flex items-center gap-1.5 rounded-md py-1 text-[0.84rem] text-muted transition-colors hover:text-ink"
      >
        <ArrowUp className="size-3.5" aria-hidden="true" />
        Volver al inicio
      </button>
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
        En este artículo
      </p>
      {progress !== undefined ? (
        <div
          className="mb-3 h-1 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Cuánto llevas leído"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-150"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}
      <ol ref={list} className="space-y-0.5 border-l border-border text-[0.84rem] leading-snug">
        {groups.map(({ head, children }) => {
          const open = expandAll || head.anchor === activeH2;
          return (
            <li key={head.anchor}>
              <TocLink entry={head} active={active} activeH2={activeH2} onSelect={onSelect} />
              {children.length && open ? (
                <ol className="mt-0.5 mb-1 space-y-0.5">
                  {children.map((e) => (
                    <li key={e.anchor}>
                      <TocLink entry={e} active={active} activeH2={activeH2} onSelect={onSelect} />
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function TocLink({
  entry,
  active,
  activeH2,
  onSelect,
}: {
  entry: TocEntry;
  active: string | null;
  activeH2: string | null;
  onSelect: (() => void) | undefined;
}) {
  const current = entry.anchor === active;
  const highlighted = current || (entry.level === 2 && entry.anchor === activeH2);
  return (
    <a
      href={`#${entry.anchor}`}
      onClick={onSelect}
      aria-current={current ? 'location' : undefined}
      className={`-ml-px block border-l-2 py-1 transition-colors ${entry.level === 3 ? 'pl-6 text-[0.8rem]' : 'pl-3'} ${
        highlighted
          ? 'border-brand font-medium text-ink'
          : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {entry.title}
    </a>
  );
}

/** Each h2 with the h3 under it (an h3 before any h2 goes on its own). */
function groupByLevel2(toc: TocEntry[]): { head: TocEntry; children: TocEntry[] }[] {
  const groups: { head: TocEntry; children: TocEntry[] }[] = [];
  for (const e of toc) {
    const last = groups.at(-1);
    if (e.level === 3 && last) last.children.push(e);
    else groups.push({ head: e, children: [] });
  }
  return groups;
}

/** The h2 that contains the active section (if the active one is an h3). */
export function activeLevel2(toc: TocEntry[], active: string | null): string | null {
  let h2: string | null = null;
  for (const e of toc) {
    if (e.level === 2) h2 = e.anchor;
    if (e.anchor === active) return h2;
  }
  return null;
}

/** The title of the section being read (for the phone's bar), or null at the top. */
export function activeTitle(toc: TocEntry[], active: string | null): string | null {
  return toc.find((e) => e.anchor === active)?.title ?? null;
}
