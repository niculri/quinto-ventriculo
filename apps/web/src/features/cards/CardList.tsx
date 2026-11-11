import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Flag, ImageIcon } from 'lucide-react';
import { Skeleton } from '../../ui/Loading';
import { clozeParts, headingAt, itemAt, listItems, listMetrics } from './model';
import type { CardStatus, ExplorerCard, Lecture, ListItem, Matched } from './model';
import { thumbUrl } from './queries';

/**
 * The list of the cards page (step 3.3, ANK-9): one row per note, of a fixed height for its kind, under its lecture and
 * its topic, in the order of the class. Only the rows in view are drawn, and the page's own scroll moves them: every
 * height is known before drawing, so nothing moves while scrolling, loading thumbnails or changing a filter. The
 * lecture and topic of what is on top stay fixed under the site's bar.
 */

/** The site's top bar (ui/AppShell.tsx, h-16): the fixed title goes right under it. */
const BAR = 64;
/** How much is drawn above and below the window. */
const OVERSCAN = 600;

/** Wide enough for the question and the answer side by side (Tailwind's `sm`). */
export function useWide(): boolean {
  const query = '(min-width: 640px)';
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export interface ListProps {
  lectures: Lecture[];
  lectureTitle: (lectureId: string) => string;
  hideAnswers: boolean;
  thumbs: string | null;
  onOpen: (item: Matched) => void;
  /** A note to bring into view (a code pasted in the search box, the card open when reloading). */
  reveal: string | null;
}

export function CardList({
  lectures,
  lectureTitle,
  hideAnswers,
  thumbs,
  onOpen,
  reveal,
}: ListProps) {
  const box = useRef<HTMLElement>(null);
  const wide = useWide();
  const [width, setWidth] = useState(0);
  const [view, setView] = useState({ top: 0, height: 800 });

  // The width and where the window is, before the first paint (the rows are drawn where they go).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // (0 only where nothing is laid out, as the tests' DOM: a phone's width.)
      setWidth(Math.round(r.width) || 360);
      setView({ top: -r.top, height: window.innerHeight });
    };
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    observer?.observe(el);
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
    };
  }, []);

  const metrics = useMemo(() => listMetrics(width || 1, wide), [width, wide]);
  const { items, total } = useMemo(() => listItems(lectures, metrics), [lectures, metrics]);

  // A note brought into view: its row right under the fixed title.
  const revealed = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!reveal || !width || revealed.current === reveal) return;
    const it = items.find(
      (i) =>
        (i.kind === 'row' && i.item.note.note.guid === reveal) ||
        (i.kind === 'cells' && i.items.some((m) => m.note.note.guid === reveal)),
    );
    if (!it || !box.current) return;
    revealed.current = reveal;
    const listTop = box.current.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, listTop + it.top - BAR - metrics.lecture - 8) });
  }, [reveal, items, width, metrics.lecture]);

  // The keyboard: ↑ ↓ (and Inicio, Fin, Re Pág, Av Pág) go through the notes; Enter opens one.
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const positions = useMemo(() => {
    const out: { item: ListItem; m: Matched }[] = [];
    for (const it of items) {
      if (it.kind === 'row') out.push({ item: it, m: it.item });
      else if (it.kind === 'cells') for (const m of it.items) out.push({ item: it, m });
    }
    return out;
  }, [items]);
  // After the scroll draws its row (it may take a frame), the focus goes to it.
  useEffect(() => {
    if (focusAt === null) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-position="${focusAt}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      setFocusAt(null);
    }
  }, [focusAt, view]);
  const go = (from: number, to: number) => {
    const target = Math.max(0, Math.min(positions.length - 1, to));
    if (target === from || !positions[target] || !box.current) return;
    const it = positions[target]!.item;
    const listTop = box.current.getBoundingClientRect().top + window.scrollY;
    const y = listTop + it.top;
    const viewTop = window.scrollY + BAR + metrics.lecture;
    const viewBottom = window.scrollY + window.innerHeight;
    if (y < viewTop) window.scrollTo({ top: y - BAR - metrics.lecture });
    else if (y + it.height > viewBottom)
      window.scrollTo({ top: y + it.height - window.innerHeight });
    setFocusAt(target);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const at = Number((e.target as HTMLElement).dataset['position'] ?? NaN);
    if (Number.isNaN(at)) return;
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: 8,
      PageUp: -8,
      ArrowRight: 1,
      ArrowLeft: -1,
    };
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      go(at, e.key === 'Home' ? 0 : positions.length - 1);
    } else if (e.key in step) {
      const it = positions[at]?.item;
      // Left and right only inside a grid's row.
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && it?.kind !== 'cells') return;
      e.preventDefault();
      const columns = it?.kind === 'cells' ? metrics.columns : 1;
      const by =
        e.key === 'ArrowDown' || e.key === 'ArrowUp' ? step[e.key]! * columns : step[e.key]!;
      go(at, at + by);
    }
  };

  const first = itemAt(items, view.top - OVERSCAN);
  const last = itemAt(items, view.top + view.height + OVERSCAN);
  const heading = headingAt(items, view.top + BAR + 1);
  const pinned = view.top + BAR > 0 && heading !== null;

  return (
    <section
      ref={box}
      aria-label="Tarjetas"
      onKeyDown={onKeyDown}
      className="relative mt-2"
      style={{ height: total }}
    >
      {/* The lecture and topic of the rows on top: fixed under the site's bar, over the list (it pushes nothing). */}
      <div className="sticky z-10 h-0" style={{ top: BAR }} aria-hidden="true">
        <div
          className={`flex items-center gap-2 border-b border-border bg-bg/95 px-1 backdrop-blur ${pinned ? '' : 'invisible'}`}
          style={{ height: metrics.lecture }}
        >
          <span className="min-w-0 truncate font-semibold">
            {heading ? lectureTitle(heading.lectureId) : ''}
          </span>
          {heading?.topic ? (
            <span className="min-w-0 truncate text-sm text-muted">› {heading.topic}</span>
          ) : null}
        </div>
      </div>
      {width
        ? items.slice(first, last + 1).map((it) => (
            <div
              key={it.key}
              className="absolute inset-x-0"
              style={{ top: it.top, height: it.height }}
            >
              <Item
                it={it}
                lectureTitle={lectureTitle}
                hideAnswers={hideAnswers}
                thumbs={thumbs}
                onOpen={onOpen}
                wide={wide}
                columns={metrics.columns}
                cell={metrics.cell}
              />
            </div>
          ))
        : null}
    </section>
  );
}

function Item({
  it,
  lectureTitle,
  hideAnswers,
  thumbs,
  onOpen,
  wide,
  columns,
  cell,
}: {
  it: ListItem;
  lectureTitle: (id: string) => string;
  hideAnswers: boolean;
  thumbs: string | null;
  onOpen: (m: Matched) => void;
  wide: boolean;
  columns: number;
  cell: number;
}) {
  switch (it.kind) {
    case 'lecture':
      return (
        <h2 className="flex h-full items-end justify-between gap-3 px-1 pb-2">
          <span className="min-w-0 truncate font-serif text-lg font-semibold">
            {lectureTitle(it.lectureId)}
          </span>
          <span className="flex-none text-sm text-muted tabular-nums">{notesText(it.notes)}</span>
        </h2>
      );
    case 'topic':
      return (
        <h3 className="flex h-full items-center justify-between gap-3 border-b border-border px-1 text-sm">
          <span className="min-w-0 truncate font-medium text-muted">{it.title}</span>
          <span className="flex-none text-xs text-muted tabular-nums">{it.notes}</span>
        </h3>
      );
    case 'row':
      return (
        <NoteRow
          m={it.item}
          position={it.position}
          hideAnswers={hideAnswers}
          thumbs={thumbs}
          onOpen={onOpen}
          wide={wide}
        />
      );
    case 'cells':
      return (
        <div
          className="grid h-full"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {it.items.map((m, i) => (
            <div key={m.note.note.guid} className="h-full min-w-0">
              <PhotoCell
                m={m}
                position={it.position + i}
                hideAnswers={hideAnswers}
                thumbs={thumbs}
                onOpen={onOpen}
                imageHeight={cell - 44}
              />
            </div>
          ))}
        </div>
      );
  }
}

export const notesText = (n: number) =>
  `${n.toLocaleString('es-CL')} ${n === 1 ? 'nota' : 'notas'}`;

const STATUS_WORDS: Record<CardStatus, [string, string]> = {
  new: ['sin ver', 'sin ver'],
  seen: ['vista', 'vistas'],
  hard: ['me cuesta', 'me cuestan'],
  hidden: ['oculta', 'ocultas'],
};

/** «3 tarjetas: 1 sin ver, 2 vistas»: what the dots say, for a screen reader. */
export function statusText(cards: readonly ExplorerCard[]): string {
  const by = new Map<CardStatus, number>();
  for (const c of cards) by.set(c.status, (by.get(c.status) ?? 0) + 1);
  const parts = (['new', 'seen', 'hard', 'hidden'] as const)
    .filter((s) => by.get(s))
    .map((s) => `${by.get(s)} ${STATUS_WORDS[s][by.get(s)! === 1 ? 0 : 1]}`);
  const marked = cards.filter((c) => c.marked).length;
  if (marked) parts.push(`${marked} ${marked === 1 ? 'marcada' : 'marcadas'}`);
  return `${cards.length} ${cards.length === 1 ? 'tarjeta' : 'tarjetas'}: ${parts.join(', ')}`;
}

/** A card's state by its color and by its shape: a ring, a dot, a triangle, a dash. */
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

function Dots({ m }: { m: Matched }) {
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

/** A cloze's text with its holes in the site's color (or covered, with «Ocultar respuestas»). */
function ClozeText({ text, hide }: { text: string; hide: boolean }) {
  return (
    <>
      {clozeParts(text).map((p, i) =>
        p.hole === null ? (
          <span key={i}>{p.text}</span>
        ) : hide ? (
          <span key={i} className="rounded bg-brand-soft px-1 text-brand">
            [{p.hole.hint ?? '…'}]
          </span>
        ) : (
          <span key={i} className="rounded bg-brand-soft px-0.5 font-medium text-brand">
            {p.text}
          </span>
        ),
      )}
    </>
  );
}

/** What a screen reader says of a row (and the text a cloze shows), without the answers when they are hidden. */
function rowLabel(m: Matched, hide: boolean): string {
  const n = m.note.note;
  const parts: string[] = [];
  switch (n.kind) {
    case 'basic':
      parts.push(n.front);
      if (!hide && n.back) parts.push(`Respuesta: ${n.back}`);
      break;
    case 'cloze':
      parts.push(
        clozeParts(n.front)
          .map((p) => (p.hole && hide ? `[${p.hole.hint ?? 'hueco'}]` : p.text))
          .join(''),
      );
      break;
    case 'occlusion':
      parts.push(n.front || n.topic || 'Imagen', labelsText(n.labels));
      break;
    case 'photo':
      parts.push(hide || !n.back ? 'Foto' : `Foto: ${n.back}`);
      break;
  }
  parts.push(statusText(m.cards));
  return parts.join(' — ');
}

const labelsText = (n: number) => `${n} ${n === 1 ? 'rótulo' : 'rótulos'}`;

const ROW_BUTTON =
  'flex h-full w-full items-center gap-3 border-b border-border/70 px-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset';

function NoteRow({
  m,
  position,
  hideAnswers,
  thumbs,
  onOpen,
  wide,
}: {
  m: Matched;
  position: number;
  hideAnswers: boolean;
  thumbs: string | null;
  onOpen: (m: Matched) => void;
  wide: boolean;
}) {
  const n = m.note.note;
  let body: ReactNode;
  if (n.kind === 'basic') {
    body = (
      <span className={`grid min-w-0 flex-1 gap-x-4 ${wide ? 'grid-cols-2' : 'grid-rows-2'}`}>
        <span className="line-clamp-2 text-sm">{n.front}</span>
        <span className="line-clamp-2 text-sm text-muted">{hideAnswers ? <Hidden /> : n.back}</span>
      </span>
    );
  } else if (n.kind === 'cloze') {
    body = (
      <span className={`min-w-0 flex-1 text-sm ${wide ? 'line-clamp-2' : 'line-clamp-3'}`}>
        <ClozeText text={n.front} hide={hideAnswers} />
      </span>
    );
  } else {
    body = (
      <>
        <Thumb thumb={n.thumb} thumbs={thumbs} blur={hideAnswers && n.kind === 'occlusion'} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm">{n.front || n.topic || 'Imagen'}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {n.kind === 'occlusion' ? labelsText(n.labels) : hideAnswers ? <Hidden /> : n.back}
          </span>
        </span>
      </>
    );
  }
  return (
    <button
      type="button"
      data-position={position}
      aria-label={rowLabel(m, hideAnswers)}
      onClick={() => onOpen(m)}
      className={ROW_BUTTON}
    >
      {body}
      <Dots m={m} />
    </button>
  );
}

function Hidden() {
  return (
    <span className="inline-block h-3 w-16 rounded bg-surface-2 align-middle" aria-hidden="true" />
  );
}

function Thumb({
  thumb,
  thumbs,
  blur,
  className = 'h-14 w-20 flex-none sm:w-24',
}: {
  thumb: string | null;
  thumbs: string | null;
  blur: boolean;
  className?: string;
}) {
  return (
    <span
      className={`flex items-center justify-center overflow-hidden rounded-md bg-surface-2 ${className}`}
      aria-hidden="true"
    >
      {thumb && thumbs ? (
        <img
          src={thumbUrl(thumb, thumbs)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`size-full object-contain ${blur ? 'blur-[6px]' : ''}`}
        />
      ) : (
        <ImageIcon className="size-5 text-muted" />
      )}
    </span>
  );
}

function PhotoCell({
  m,
  position,
  hideAnswers,
  thumbs,
  onOpen,
  imageHeight,
}: {
  m: Matched;
  position: number;
  hideAnswers: boolean;
  thumbs: string | null;
  onOpen: (m: Matched) => void;
  imageHeight: number;
}) {
  const n = m.note.note;
  return (
    <button
      type="button"
      data-position={position}
      aria-label={rowLabel(m, hideAnswers)}
      onClick={() => onOpen(m)}
      className="flex h-full w-full flex-col rounded-lg p-1.5 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="relative block w-full" style={{ height: Math.max(40, imageHeight) }}>
        <Thumb thumb={n.thumb} thumbs={thumbs} blur={false} className="size-full" />
        <span className="absolute right-1 bottom-1 rounded bg-surface/90 px-1 py-0.5">
          <Dots m={m} />
        </span>
      </span>
      <span className="mt-1 block h-5 truncate text-xs">{hideAnswers ? <Hidden /> : n.back}</span>
    </button>
  );
}

/** The list while it loads: the same heights as its first rows. */
export function ListSkeleton() {
  const wide = typeof window === 'undefined' ? true : window.innerWidth >= 640;
  const m = listMetrics(800, wide);
  return (
    <div className="mt-2" aria-hidden="true">
      <div className="flex items-end px-1 pb-2" style={{ height: m.lecture }}>
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="flex items-center border-b border-border px-1" style={{ height: m.topic }}>
        <Skeleton className="h-3.5 w-40" />
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border/70 px-2"
          style={{ height: m.row }}
        >
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}
