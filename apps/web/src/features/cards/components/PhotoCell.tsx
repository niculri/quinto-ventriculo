// A photo's cell in the grid the cards page's list draws when a lecture's images are mostly photos.
import type { Matched } from '../model/filters';
import { SrOnly } from './SrOnly';
import { Dots, statusText } from './CardStatus';
import { Thumb } from './Thumb';
import { HiddenAnswer } from './NoteRow';
import { photoCellStrings } from './strings/PhotoCell.strings';

export function PhotoCell({
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
      onClick={() => onOpen(m)}
      className="flex h-full w-full flex-col rounded-lg p-1.5 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="relative block w-full" style={{ height: Math.max(40, imageHeight) }}>
        <Thumb thumb={n.thumb} thumbs={thumbs} blur={false} className="size-full" />
        <span className="absolute right-1 bottom-1 rounded bg-surface/90 px-1 py-0.5">
          <Dots m={m} />
        </span>
      </span>
      <span className="mt-1 block h-5 truncate text-xs">
        <SrOnly>{photoCellStrings.list.photo}</SrOnly>
        {hideAnswers || !n.back ? (
          <HiddenAnswer />
        ) : (
          <>
            <SrOnly>: </SrOnly>
            {n.back}
          </>
        )}
        <SrOnly> — {statusText(m.cards)}</SrOnly>
      </span>
    </button>
  );
}
