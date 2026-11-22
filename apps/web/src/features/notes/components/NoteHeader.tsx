// An article's header: its kind or the line under the title, its code and dates, and its sources.
import type { Note } from '@qv/schema';
import { tapArea } from '../../../shared/ui/styles';
import { headerParts, noteDates, versionedCode } from '../model/header';
import { kindStrings } from '../../../shared/strings/noteKinds.strings';
import { noteHeaderStrings as s } from './strings/NoteHeader.strings';

export function NoteHeader({ note }: { note: Note }) {
  const parts = note.header ? headerParts(note.kind, note.header) : [];
  return (
    <header className="mb-10 border-b border-border pb-8">
      {note.header ? null : (
        <p className="mb-2 text-xs font-semibold tracking-wide text-brand uppercase">
          {kindStrings[note.kind]}
        </p>
      )}
      <h1 className="font-serif text-[2.1rem] leading-tight font-semibold tracking-tight sm:text-[2.6rem]">
        {note.title}
      </h1>
      {note.subtitle ? <p className="mt-3 text-lg text-muted">{note.subtitle}</p> : null}
      {parts.length ? (
        <p className="mt-4 text-[0.95rem] leading-relaxed text-ink">
          {parts.map((p, i) => (
            <span key={p}>
              {i ? <span className="px-1.5 text-muted">·</span> : null}
              <span className={i === 0 ? 'font-semibold' : ''}>{p}</span>
            </span>
          ))}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <span
          className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink"
          title={note.code ? s.header.code : undefined}
        >
          {versionedCode(note)}
        </span>
        {noteDates(note).map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {note.sources.length ? (
        <details className="group mt-4 text-sm">
          <summary className={`cursor-pointer text-muted select-none hover:text-ink ${tapArea}`}>
            {s.header.sources}
          </summary>
          <ul className="mt-2 space-y-1.5 border-l-2 border-border pl-4 leading-relaxed text-muted">
            {note.sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </header>
  );
}
