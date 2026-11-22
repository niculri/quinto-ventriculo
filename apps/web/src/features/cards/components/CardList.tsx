// The cards page's virtual list: a fixed-height row per note under its lecture and topic, drawn only in view, so
// nothing moves while scrolling or filtering; the lecture and topic on top stay fixed under the site's bar.

import { useMemo } from 'react';
import type { Lecture } from '../model/groups';
import type { Matched } from '../model/filters';
import { headingAt, itemAt, listItems, listMetrics } from '../model/list';
import type { ListItem } from '../model/list';
import { BAR } from '../model/list';
import { useListKeys } from '../hooks/useListKeys';
import { useListViewport } from '../hooks/useListViewport';
import { useReveal } from '../hooks/useReveal';
import { NoteRow } from './NoteRow';
import { PhotoCell } from './PhotoCell';
import { cardListStrings } from './strings/CardList.strings';

const OVERSCAN = 600;

export interface ListProps {
  lectures: Lecture[];
  lectureTitle: (lectureId: string) => string;
  hideAnswers: boolean;
  thumbs: string | null;
  onOpen: (item: Matched) => void;
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
  const { boxRef, wide, width, view } = useListViewport();
  // The compiler leaves this one without a cache (its output shows it), so it stays by hand.
  const metrics = useMemo(() => listMetrics(width || 1, wide), [width, wide]);
  const { items, total } = useMemo(() => listItems(lectures, metrics), [lectures, metrics]);

  useReveal({ reveal, items, width, boxRef, lectureHeight: metrics.lecture });
  const onKeyDown = useListKeys({ items, metrics, boxRef, view });

  const first = itemAt(items, view.top - OVERSCAN);
  const last = itemAt(items, view.top + view.height + OVERSCAN);
  const heading = headingAt(items, view.top + BAR + 1);
  const pinned = view.top + BAR > 0 && heading !== null;

  return (
    <section
      ref={boxRef}
      aria-label={cardListStrings.list.label}
      onKeyDown={onKeyDown}
      className="relative mt-2"
      style={{ height: total }}
    >
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
          <span className="flex-none text-sm text-muted tabular-nums">
            {cardListStrings.notes(it.notes)}
          </span>
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
