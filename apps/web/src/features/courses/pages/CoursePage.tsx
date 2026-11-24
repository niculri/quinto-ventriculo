// A course's page, a dashboard: for each assessment, one card per section (notes, tests, Anki) with what it has.
import { ChartColumn, Layers, Search } from 'lucide-react';
import { Link, useParams } from 'react-router';
import type { Catalog, CourseWithAssessments, SemesterWithCourses } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { Canonical } from '../../../shared/ui/Canonical';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { Loading } from '../../../shared/ui/Loading';
import { button, page } from '../../../shared/ui/styles';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { PageCrumbs } from '../../catalog/components/AdminMarks';
import { countDecks, countNotes, findCourse, quizIdsOf } from '../../catalog/model/catalog';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { Heatmap } from '../../stats/components/Heatmap';
import { useCourseDecks } from '../hooks/useCourseDecks';
import { joined, withMaterial } from '../model/material';
import { AssessmentCards } from '../components/AssessmentCards';
import { coursePageStrings as s } from './strings/CoursePage.strings';
import { assessmentCardsStrings } from '../components/strings/AssessmentCards.strings';
import { ankiCardStrings } from '../components/strings/AnkiCard.strings';

export function CoursePage() {
  const { courseId = '', number = '' } = useParams();
  const catalog = useCatalog();
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  const found = findCourse(catalog.data, courseId);
  if (!found) return <NotFoundPage />;
  const { semester, course } = found;
  if (String(semester.number) !== number) return <Canonical path={paths.course(course)} />;
  return <CourseView catalog={catalog.data} semester={semester} course={course} />;
}

function CourseView({
  catalog,
  semester,
  course,
}: {
  catalog: Catalog;
  semester: SemesterWithCourses;
  course: CourseWithAssessments;
}) {
  const decks = useCourseDecks(catalog, course);
  const assessments = withMaterial(course, decks.tree);
  const notes = countNotes(course);
  const quizzes = course.assessments.reduce((t, a) => t + a.quizzes.length, 0);
  const deckCount = countDecks(catalog, course.id);
  const material = joined([
    notes ? s.notes(notes) : '',
    quizzes ? assessmentCardsStrings.tests(quizzes) : '',
    deckCount ? ankiCardStrings.decks(deckCount) : '',
  ]);

  return (
    <div className={page}>
      <PageCrumbs
        thing={['course', course.id]}
        items={[
          { label: s.home, to: paths.home },
          { label: semester.name, to: paths.semester(semester.number) },
          { label: course.name },
        ]}
      />
      <h1 className="flex items-center gap-3 font-serif text-3xl font-semibold tracking-tight">
        <span aria-hidden="true">{course.emoji}</span> {course.name}
      </h1>
      {material ? <p className="mt-1 text-sm text-muted">{material}</p> : null}

      {decks.decks || quizzes > 0 ? (
        <Heatmap
          scope={`course:${course.id}`}
          deckIds={catalog.anki.decks.filter((d) => d.courseId === course.id).map((d) => d.id)}
          quizIds={quizIdsOf(course)}
          catalog={catalog}
          groupBy="assessment"
          courseId={course.id}
          className="mt-8"
        />
      ) : null}

      {assessments.length === 0 ? (
        <div className="mt-6 text-muted">
          <p>{s.empty}</p>
          <Link to={paths.courses} className={`${button.base} ${button.secondary} mt-4`}>
            {s.career}
          </Link>
        </div>
      ) : (
        assessments.map((a) => (
          <AssessmentCards
            key={a.id}
            catalog={catalog}
            course={course}
            assessment={a}
            decks={decks}
          />
        ))
      )}

      {decks.decks ? (
        <p className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link
            to={paths.deck(decks.decks.ref)}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <Layers className="size-4" aria-hidden="true" />
            {s.allDecks}
          </Link>
          <Link
            to={paths.cards(decks.decks.ref)}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <Search className="size-4" aria-hidden="true" />
            {s.seeCards}
          </Link>
          <Link
            to={paths.deckStats(decks.decks.ref)}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <ChartColumn className="size-4" aria-hidden="true" />
            {s.stats}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
