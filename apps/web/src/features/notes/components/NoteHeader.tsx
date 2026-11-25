// An article's header: its lines (HeaderLines) and, folded under them, its code, dates and sources.
import type { Note } from '@qv/schema';
import { tapArea } from '../../../shared/ui/styles';
import { noteDates, versionedCode } from '../model/header';
import { HEADER_BOX, HeaderLines } from './HeaderLines';
import { noteHeaderStrings as s } from './strings/NoteHeader.strings';

export function NoteHeader({ note }: { note: Note }) {
  return (
    <header className={HEADER_BOX}>
      <HeaderLines note={note} />
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
