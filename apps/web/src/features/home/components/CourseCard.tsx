// A course in «Tus ramos»: its emoji, name and what material it has, as a card to its page.

import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import type { Catalog, CourseWithAssessments } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { linkCard } from '../../../shared/ui/styles';
import { countDecks, countNotes, materialLabel } from '../../catalog/model/catalog';

export function CourseCard({
  catalog,
  course,
}: {
  catalog: Catalog;
  course: CourseWithAssessments;
}) {
  const material = materialLabel(countNotes(course), countDecks(catalog, course.id));
  return (
    <Link
      to={paths.course(course)}
      className={`${linkCard} group flex items-center gap-3 p-4 pr-12`}
    >
      <span className="text-2xl" aria-hidden="true">
        {course.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{course.name}</span>
        <span className="block truncate text-sm text-muted">{material}</span>
      </span>
      <ArrowRight
        className="size-4 flex-none text-muted transition group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
