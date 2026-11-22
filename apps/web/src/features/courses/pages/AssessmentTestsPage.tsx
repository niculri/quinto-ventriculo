// An assessment's «Tests» page: its tests, or where to go while it has none.
import { Link } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { Canonical } from '../../../shared/ui/Canonical';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { button, card } from '../../../shared/ui/styles';
import { useAssessmentSection } from '../hooks/useAssessmentSection';
import { SectionFrame } from '../components/SectionFrame';
import { QuizRow } from '../components/QuizRow';
import { assessmentTestsPageStrings as s } from './strings/AssessmentTestsPage.strings';

export function AssessmentTestsPage() {
  const { catalog, found, number, assessment } = useAssessmentSection();
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  if (!found || !assessment) return <NotFoundPage />;
  const { semester, course } = found;
  if (String(semester.number) !== number) {
    return <Canonical path={paths.assessmentTests(course, assessment.id)} />;
  }
  return (
    <SectionFrame semester={semester} course={course} assessment={assessment} title={s.tests}>
      {assessment.quizzes.length ? (
        <ol className={`${card} mt-8 divide-y divide-border`}>
          {assessment.quizzes.map((q) => (
            <QuizRow key={q.id} course={course} quiz={q} />
          ))}
        </ol>
      ) : (
        <div className="mt-6 text-muted">
          <p>
            {s.noTests}
            {assessment.notes.length ? s.meanwhile : ''}
          </p>
          <Link
            to={
              assessment.notes.length
                ? paths.assessmentNotes(course, assessment.id)
                : paths.course(course)
            }
            className={`${button.base} ${button.secondary} mt-4`}
          >
            {assessment.notes.length ? s.seeNotes : s.backToCourse(course.name)}
          </Link>
        </div>
      )}
    </SectionFrame>
  );
}
