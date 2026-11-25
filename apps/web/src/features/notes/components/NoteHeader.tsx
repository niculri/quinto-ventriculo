// An article's header: its kind or the line under the title, and, folded under them, its code, dates and sources.
import type { Note } from '@qv/schema';
import { tapArea } from '../../../shared/ui/styles';
import { headerParts, noteDates, versionedCode } from '../model/header';
import { kindStrings } from '../../../shared/strings/noteKinds.strings';
import { noteHeaderStrings as s } from './strings/NoteHeader.strings';

export function NoteHeader({ note }: { note: Note }) {
  const parts = note.header ? headerParts(note.kind, note.header) : [];
  return (
    <header className="mb-6 border-b border-border pb-3.5">
      {note.header ? null : (
        <p className="mb-1 text-xs font-semibold tracking-wide text-brand uppercase">
          {kindStrings[note.kind]}
        </p>
      )}
      <h1 className="font-serif text-[1.7rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
        {note.title}
      </h1>
      {note.subtitle ? <p className="mt-1 text-muted">{note.subtitle}</p> : null}
      {parts.length ? (
        <p className="mt-2 text-sm leading-relaxed text-ink">
          {parts.map((p, i) => (
            <span key={p}>
              {i ? <span className="px-1.5 text-muted">·</span> : null}
              <span className={i === 0 ? 'font-semibold' : ''}>{p}</span>
            </span>
          ))}
        </p>
      ) : null}
      <details className="mt-1.5 text-sm text-muted">
        <summary className={`cursor-pointer select-none hover:text-ink ${tapArea}`}>
          {note.sources.length ? s.header.details : s.header.detailsWithoutSources}
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
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
          <ul className="mt-2 space-y-1.5 border-l-2 border-border pl-4 leading-relaxed">
            {note.sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        ) : null}
      </details>
    </header>
  );
}
