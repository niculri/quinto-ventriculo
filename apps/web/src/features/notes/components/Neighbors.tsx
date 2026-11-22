// The previous and the next note of the assessment, at the end of an article.
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import type { NoteLocation } from '../../catalog/model/catalog';
import { neighborsStrings as s } from './strings/Neighbors.strings';

export function Neighbors({ location }: { location: NoteLocation }) {
  const { previous, next } = location;
  if (!previous && !next) return null;
  const box =
    'flex-1 rounded-xl border border-border p-4 transition hover:border-border-strong hover:bg-surface';
  return (
    <nav
      aria-label={s.neighbors.label}
      className="mt-16 flex flex-col gap-3 border-t border-border pt-8 sm:flex-row"
    >
      {previous ? (
        <Link to={paths.note(location.course, previous.slug)} className={box}>
          <span className="flex items-center gap-1 text-xs text-muted">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {s.neighbors.previous}
          </span>
          <span className="mt-1 block font-medium">{previous.title}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      {next ? (
        <Link to={paths.note(location.course, next.slug)} className={`${box} text-right`}>
          <span className="flex items-center justify-end gap-1 text-xs text-muted">
            {s.neighbors.next}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
          <span className="mt-1 block font-medium">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}
