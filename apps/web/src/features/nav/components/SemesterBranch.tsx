// The semester open in the site's menu: its courses with material, or the open course with its assessments.
import { useState } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import type { CourseWithAssessments, SemesterWithCourses } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { ListMark } from '../../catalog/components/AdminMarks';
import { hasPage } from '../../catalog/model/tree';
import type { AnkiTree, CourseDeckNode } from '../../catalog/model/tree';
import { hasMaterial } from '../model/where';
import type { Where } from '../model/where';
import { AssessmentParts } from './AssessmentParts';
import { NavLink, Nested, icon } from './NavLink';
import { gymkanaDeck } from '../../catalog/model/gymkana';

export function SemesterBranch({
  semester,
  where,
  tree,
  pathname,
  onNavigate,
}: {
  semester: SemesterWithCourses;
  where: Where;
  tree: AnkiTree;
  pathname: string;
  onNavigate?: (() => void) | undefined;
}) {
  const course = semester.courses.find((c) => c.id === where.courseId) ?? null;
  const emoji = (c: CourseWithAssessments) => (
    <span className="w-4 flex-none text-center" aria-hidden="true">
      {c.emoji}
    </span>
  );
  return (
    <>
      <li>
        <NavLink
          to={paths.semester(semester.number)}
          active={pathname === paths.semester(semester.number)}
          inPath={course !== null}
          icon={<CalendarDays className={icon} aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          {semester.name}
          <ListMark thing={['semester', semester.number]} />
        </NavLink>
        {course ? null : (
          <Nested>
            {semester.courses
              .filter((c) => hasMaterial(c, tree))
              .map((c) => (
                <li key={c.id}>
                  <NavLink
                    to={paths.course(c)}
                    active={false}
                    icon={emoji(c)}
                    onNavigate={onNavigate}
                  >
                    {c.name}
                    <ListMark thing={['course', c.id]} holder={['semester', semester.number]} />
                  </NavLink>
                </li>
              ))}
          </Nested>
        )}
      </li>
      {course ? (
        <>
          <li>
            <NavLink
              to={paths.course(course)}
              active={pathname === paths.course(course)}
              inPath
              icon={emoji(course)}
              onNavigate={onNavigate}
            >
              {course.name}
              <ListMark thing={['course', course.id]} holder={['semester', semester.number]} />
            </NavLink>
          </li>
          <CourseAssessments course={course} where={where} tree={tree} onNavigate={onNavigate} />
        </>
      ) : null}
    </>
  );
}

function CourseAssessments({
  course,
  where,
  tree,
  onNavigate,
}: {
  course: CourseWithAssessments;
  where: Where;
  tree: AnkiTree;
  onNavigate?: (() => void) | undefined;
}) {
  const decks = tree.nodes.filter(
    (n): n is CourseDeckNode => n.depth === 3 && hasPage(n) && n.courseId === course.id,
  );
  const assessments = course.assessments.filter(
    (a) => a.notes.length || a.quizzes.length || decks.some((d) => d.assessmentId === a.id),
  );
  // On the course's page every assessment is open; deeper, the one being read.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  if (!assessments.length) return null;
  return (
    <>
      {assessments.map((a) => {
        const inPath = a.id === where.assessmentId;
        const open = toggled[a.id] ?? (inPath || where.assessmentId === null);
        const deck = decks.find((d) => d.assessmentId === a.id) ?? null;
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setToggled((t) => ({ ...t, [a.id]: !open }))}
              aria-expanded={open}
              className="mt-3 flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-xs font-semibold tracking-wide text-muted uppercase transition-colors hover:text-ink"
            >
              <span className="min-w-0 flex-1">
                {a.name}
                <ListMark thing={['assessment', a.id]} holder={['course', course.id]} />
              </span>
              <ChevronRight
                className={`size-3.5 flex-none transition-transform ${open ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
            </button>
            {open ? (
              <ul className="mt-0.5 space-y-0.5">
                <AssessmentParts
                  course={course}
                  assessment={a}
                  deck={deck}
                  gymkana={gymkanaDeck(tree, a.id)}
                  where={
                    inPath
                      ? where
                      : { ...where, tab: null, noteSlug: null, quizSlug: null, deckId: null }
                  }
                  onNavigate={onNavigate}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}
