// The lines of an article's header above its fold: its kind or the line under the title, the title and the subtitle.
// The loading state draws the same lines as gray bars, so they wrap where the article's will and take its room.
import type { NoteSummary } from '@qv/schema';
import { kindStrings } from '../../../shared/strings/noteKinds.strings';
import { headerParts } from '../model/header';

/** The header's box, the same in the loading state: the rule under the lines and the room around it. */
export const HEADER_BOX = 'mb-6 border-b border-border pb-3.5';

const LOOK = {
  shown: { kind: 'text-brand', subtitle: 'text-muted', line: 'text-ink', dot: 'text-muted' },
  ghost: { kind: '', subtitle: '', line: '', dot: 'invisible' },
};

// A bar per line, shorter than the line, so the lines of a long title do not join.
const BAR =
  'animate-pulse bg-linear-to-r from-surface-2 to-surface-2 bg-size-[100%_70%] bg-center bg-no-repeat box-decoration-clone';

/**
 * A run of the header's text. In the loading state, a gray bar where the text will be, with the text hidden: a hidden
 * text that moves when its font arrives is not a layout shift, a transparent one is.
 */
function Run({ ghost, bold = false, text }: { ghost: boolean; bold?: boolean; text: string }) {
  const weight = bold ? 'font-semibold' : undefined;
  if (!ghost) return <span className={weight}>{text}</span>;
  return (
    <span className={`${BAR} ${weight ?? ''}`}>
      <span className="invisible">{text}</span>
    </span>
  );
}

export function HeaderLines({ note, ghost = false }: { note: NoteSummary; ghost?: boolean }) {
  const parts = note.header ? headerParts(note.kind, note.header) : [];
  const look = ghost ? LOOK.ghost : LOOK.shown;
  const Title = ghost ? 'p' : 'h1';
  return (
    <>
      {note.header ? null : (
        <p className={`mb-1 text-xs font-semibold tracking-wide uppercase ${look.kind}`}>
          <Run ghost={ghost} text={kindStrings[note.kind]} />
        </p>
      )}
      <Title className="font-serif text-[1.7rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
        <Run ghost={ghost} text={note.title} />
      </Title>
      {note.subtitle ? (
        <p className={`mt-1 ${look.subtitle}`}>
          <Run ghost={ghost} text={note.subtitle} />
        </p>
      ) : null}
      {parts.length ? (
        <p className={`mt-2 text-sm leading-relaxed ${look.line}`}>
          {parts.map((p, i) => (
            <span key={p}>
              {i ? <span className={`px-1.5 ${look.dot}`}>·</span> : null}
              <Run ghost={ghost} bold={i === 0} text={p} />
            </span>
          ))}
        </p>
      ) : null}
    </>
  );
}
