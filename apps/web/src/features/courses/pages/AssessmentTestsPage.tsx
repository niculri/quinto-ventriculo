// An assessment's «Tests» page: its tests; without any, it does not exist.
import { paths } from '../../../shared/lib/paths';
import { Canonical } from '../../../shared/ui/Canonical';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { card } from '../../../shared/ui/styles';
import { useAssessmentSection } from '../hooks/useAssessmentSection';
import { SectionFrame } from '../components/SectionFrame';
import { QuizRow } from '../components/QuizRow';
import { assessmentTestsPageStrings as s } from './strings/AssessmentTestsPage.strings';

export function AssessmentTestsPage() {
  const { catalog, found, number, assessment } = useAssessmentSection();
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  if (!found || !assessment?.quizzes.length) return <NotFoundPage />;
  const { semester, course } = found;
  if (String(semester.number) !== number) {
    return <Canonical path={paths.assessmentTests(course, assessment.id)} />;
  }
  return (
    <SectionFrame semester={semester} course={course} assessment={assessment} title={s.tests}>
      <ol className={`${card} mt-8 divide-y divide-border`}>
        {assessment.quizzes.map((q) => (
          <QuizRow key={q.id} course={course} quiz={q} />
        ))}
      </ol>
    </SectionFrame>
  );
}
