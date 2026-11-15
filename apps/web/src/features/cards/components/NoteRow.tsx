// A note's row in the cards page's list: its question and answer (or a cloze's holes, or an image), and its cards.
import { clozeParts } from '../model/cloze';
import type { Matched } from '../model/filters';
import { Said } from './Said';
import { Dots, statusText } from './CardStatus';
import { Thumb } from './Thumb';
import { cardsStrings } from '../strings';

function ClozeText({ text, hide }: { text: string; hide: boolean }) {
  return (
    <>
      {clozeParts(text).map((p, i) =>
        p.hole === null ? (
          <span key={i}>{p.text}</span>
        ) : hide ? (
          <span key={i} className="rounded bg-brand-soft px-1 text-brand">
            [
            {p.hole.hint ?? (
              <>
                <span aria-hidden="true">…</span>
                <Said>{cardsStrings.list.hole}</Said>
              </>
            )}
            ]
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

const ROW_BUTTON =
  'flex h-full w-full items-center gap-3 border-b border-border/70 px-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset';

export function NoteRow({
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
  return (
    <button type="button" data-position={position} onClick={() => onOpen(m)} className={ROW_BUTTON}>
      <RowBody note={n} hideAnswers={hideAnswers} thumbs={thumbs} wide={wide} />
      <Said> — {statusText(m.cards)}</Said>
      <Dots m={m} />
    </button>
  );
}

export function Hidden() {
  return (
    <span className="inline-block h-3 w-16 rounded bg-surface-2 align-middle" aria-hidden="true" />
  );
}

type IndexNote = Matched['note']['note'];

function RowBody({
  note: n,
  hideAnswers,
  thumbs,
  wide,
}: {
  note: IndexNote;
  hideAnswers: boolean;
  thumbs: string | null;
  wide: boolean;
}) {
  if (n.kind === 'basic') {
    return (
      <span className={`grid min-w-0 flex-1 gap-x-4 ${wide ? 'grid-cols-2' : 'grid-rows-2'}`}>
        <span className="line-clamp-2 text-sm">{n.front}</span>
        <span className="line-clamp-2 text-sm text-muted">
          {hideAnswers || !n.back ? (
            <Hidden />
          ) : (
            <>
              <Said> — </Said>
              {n.back}
            </>
          )}
        </span>
      </span>
    );
  }
  if (n.kind === 'cloze') {
    return (
      <span className={`min-w-0 flex-1 text-sm ${wide ? 'line-clamp-2' : 'line-clamp-3'}`}>
        <ClozeText text={n.front} hide={hideAnswers} />
      </span>
    );
  }
  return (
    <>
      <Thumb thumb={n.thumb} thumbs={thumbs} blur={hideAnswers && n.kind === 'occlusion'} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm">
          {n.kind === 'photo' ? <Said>{cardsStrings.list.photoOf}</Said> : null}
          {n.front || n.topic || cardsStrings.list.image}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          {n.kind === 'occlusion' ? (
            <>
              <Said> — </Said>
              {cardsStrings.list.labels(n.labels)}
            </>
          ) : hideAnswers || !n.back ? (
            <Hidden />
          ) : (
            <>
              <Said> — </Said>
              {n.back}
            </>
          )}
        </span>
      </span>
    </>
  );
}
