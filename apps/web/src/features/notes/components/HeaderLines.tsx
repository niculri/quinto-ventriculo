// The lines of an article's header above its fold: its kind or the line under the title, the title and the subtitle.
// The loading state draws the same lines as gray bars, so they wrap where the article's will and take its room.
import type { NoteSummary } from '@qv/schema';
import { kindStrings } from '../../../shared/strings/noteKinds.strings';
import { headerParts } from '../model/header';

/** The header's box, the same in the loading state: the rule under the lines and the room around it. */
export const HEADER_BOX = 'mb-6 border-b border-border pb-3.5';

const UNSEEN = 'text-transparent select-none';

const LOOK = {
  shown: {
    kind: 'text-brand',
    title: '',
    subtitle: 'text-muted',
    line: 'text-ink',
    dot: 'text-muted',
    run: '',
  },
  ghost: {
    kind: UNSEEN,
    title: UNSEEN,
    subtitle: UNSEEN,
    line: UNSEEN,
    dot: '',
    // A bar per line, shorter than the line, so the lines of a long title do not join.
    run: 'animate-pulse bg-linear-to-r from-surface-2 to-surface-2 bg-size-[100%_70%] bg-center bg-no-repeat box-decoration-clone',
  },
};

export function HeaderLines({ note, ghost = false }: { note: NoteSummary; ghost?: boolean }) {
  const parts = note.header ? headerParts(note.kind, note.header) : [];
  const look = ghost ? LOOK.ghost : LOOK.shown;
  const Title = ghost ? 'p' : 'h1';
  return (
    <>
      {note.header ? null : (
        <p className={`mb-1 text-xs font-semibold tracking-wide uppercase ${look.kind}`}>
          <span className={look.run}>{kindStrings[note.kind]}</span>
        </p>
      )}
      <Title
        className={`font-serif text-[1.7rem] leading-tight font-semibold tracking-tight sm:text-[2rem] ${look.title}`}
      >
        <span className={look.run}>{note.title}</span>
      </Title>
      {note.subtitle ? (
        <p className={`mt-1 ${look.subtitle}`}>
          <span className={look.run}>{note.subtitle}</span>
        </p>
      ) : null}
      {parts.length ? (
        <p className={`mt-2 text-sm leading-relaxed ${look.line}`}>
          {parts.map((p, i) => (
            <span key={p}>
              {i ? <span className={`px-1.5 ${look.dot}`}>·</span> : null}
              <span className={`${look.run} ${i === 0 ? 'font-semibold' : ''}`}>{p}</span>
            </span>
          ))}
        </p>
      ) : null}
    </>
  );
}
