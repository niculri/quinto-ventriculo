// A practice test page: finds the test in the catalog, picks the section (tab) and runs the cover, rounds and results.
import { paths } from '../../../shared/lib/paths';
import { Canonical } from '../../../shared/ui/Canonical';
import { Loading } from '../../../shared/ui/Loading';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { PageCrumbs } from '../../catalog/components/AdminMarks';
import { QuizScreen } from '../components/QuizScreen';
import { useQuizPage } from '../hooks/useQuizPage';
import type { QuizPageView } from '../hooks/useQuizPage';
import { themeStyle } from '../model/theme';
import { quizPageStrings as s } from './strings/QuizPage.strings';
import '../styles/quiz.css';

type Ready = Extract<QuizPageView, { kind: 'ready' }>;

function Crumbs({ view }: { view: Ready }) {
  const { semester, course } = view.found;
  const { assessment, onlyTest } = view;
  return (
    <div className="wrap wide qz-crumbs">
      <PageCrumbs
        thing={['quiz', view.quiz.id]}
        items={[
          { label: s.crumbs.home, to: paths.home },
          { label: semester.name, to: paths.semester(semester.number) },
          { label: course.name, to: paths.course(course) },
          ...(assessment
            ? [
                { label: assessment.name, to: paths.assessment(course, assessment.id) },
                ...(assessment.quizzes.length > 1
                  ? [{ label: s.crumbs.tests, to: paths.assessmentTests(course, assessment.id) }]
                  : []),
              ]
            : []),
          { label: onlyTest ? s.crumbs.tests : view.quiz.title },
        ]}
      />
    </div>
  );
}

export function QuizPage() {
  const view = useQuizPage();
  if (view.kind === 'error') {
    const q = view.query;
    return <ErrorWithRetry error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (view.kind === 'loading') return <Loading />;
  if (view.kind === 'notFound') return <NotFoundPage />;
  if (view.kind === 'canonical') return <Canonical path={view.path} />;
  const { assessment } = view;
  return (
    <div className="quiz pb-4" style={themeStyle(view.quiz)}>
      <QuizScreen
        // Each section has its own round, so another tab remounts the screen.
        key={view.section.id}
        quiz={view.quiz}
        section={view.section}
        detail={view.detail}
        course={view.found.course}
        assessment={assessment ? { id: assessment.id, name: assessment.name } : null}
        saved={view.saved}
        fromTab={view.fromTab}
        inRound={view.inRound}
        topics={view.topics}
        heading={view.onlyTest ? s.crumbs.tests : null}
        crumbs={<Crumbs view={view} />}
      />
    </div>
  );
}
