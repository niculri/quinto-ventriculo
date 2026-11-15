// The quick search's list of results, with the selected one marked.
import { FileText } from 'lucide-react';
import type { SearchResult } from '@qv/schema';
import { Snippet } from './Snippet';
import { paletteStrings as s } from '../palette.strings';

export function PaletteResults({
  results,
  selected,
  onSelect,
  onOpen,
}: {
  results: SearchResult[];
  selected: number;
  onSelect: (i: number) => void;
  onOpen: (r: SearchResult) => void;
}) {
  return (
    <ul id="palette-results" role="listbox" aria-label={s.results}>
      {results.map((r, i) => (
        <li
          key={`${r.noteId}-${r.anchor}`}
          id={`palette-result-${i}`}
          role="option"
          aria-selected={i === selected}
          onMouseEnter={() => onSelect(i)}
          onClick={() => onOpen(r)}
          className={`flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 ${i === selected ? 'bg-surface-2' : ''}`}
        >
          <FileText className="mt-0.5 size-4 flex-none text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {r.section}
              <span className="font-normal text-muted"> · {r.noteTitle}</span>
            </p>
            <p className="line-clamp-2 text-[0.82rem] leading-snug text-muted">
              <Snippet text={r.snippet} />
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
