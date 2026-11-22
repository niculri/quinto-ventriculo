// A semester in «La carrera»: its courses and how much material they have, or «Pronto.» without courses.
import { ArrowRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router';
import type { Catalog, SemesterWithCourses } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { card, linkCard } from '../../../shared/ui/styles';
import { ListMark } from '../../catalog/components/AdminMarks';
import { countDecks, countNotes, materialLabel } from '../../catalog/model/catalog';
import { semesterCardStrings as s } from './strings/SemesterCard.strings';

export function SemesterCard({
  semester,
  catalog,
}: {
  semester: SemesterWithCourses;
  catalog: Catalog;
}) {
  const notes = semester.courses.reduce((t, c) => t + countNotes(c), 0);
  const decks = semester.courses.reduce((t, c) => t + countDecks(catalog, c.id), 0);
  if (!semester.courses.length) {
    return (
      <div className={`${card} border-dashed p-5 shadow-none`}>
        <p className="font-semibold text-muted">
          {semester.name}
          <ListMark thing={['semester', semester.number]} />
        </p>
        <p className="mt-1 text-sm text-muted">{s.soon}</p>
      </div>
    );
  }
  return (
    <Link to={paths.semester(semester.number)} className={`${linkCard} group p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">
          {semester.name}
          <ListMark thing={['semester', semester.number]} />
        </p>
        <ArrowRight
          className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink"
          aria-hidden="true"
        />
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {semester.courses.map((c) => (
          <li key={c.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
            {c.emoji} {c.name}
            <ListMark thing={['course', c.id]} holder={['semester', semester.number]} />
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <BookOpen className="size-3.5" aria-hidden="true" />
        {materialLabel(notes, decks) || s.onTheWay}
      </p>
    </Link>
  );
}
