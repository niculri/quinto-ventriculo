// A test section's screen: the cover, a question with its bar, or the results, with their popups and the save warning.
import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router';
import type { Round } from '@qv/quiz';
import type { QuizDetail, QuizSectionDetail, QuizSectionSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import type { CourseRef } from '../../../shared/lib/paths';
import { backLabel } from '../../../shared/ui/BackButton';
import { ImageViewer } from '../../../shared/ui/ImageViewer';
import { StatusToast } from '../../../shared/ui/Toast';
import { sharedStrings } from '../../../shared/strings';
import { ReportDialog } from '../../reports/components/ReportDialog';
import type { ReportTarget } from '../../reports/api/repository';
import type { SavedQuiz } from '../api/repository';
import type { RoundActions } from '../model/roundActions';
import { useQuizScreen } from '../hooks/useQuizScreen';
import type { QuestionEntry } from '../model/entries';
import { quizStrings as s } from '../strings';
import { Cover } from './Cover';
import { Html } from './Html';
import { QuestionCard } from './QuestionCard';
import { QuizBar } from './QuizBar';
import { RestartDialog } from './RestartDialog';
import { Results } from './Results';

function SaveWarning({ wide, onRetry }: { wide: boolean; onRetry: () => void }) {
  return (
    <div className={wide ? 'wrap wide' : 'wrap'}>
      <div className="qz-warn" role="alert">
        <span>{s.saving.failed}</span>
        <button type="button" className="btn2" onClick={onRetry}>
          {s.saving.retry}
        </button>
      </div>
    </div>
  );
}

function QuizPopups({
  popups,
  target,
  onRestart,
  restartRef,
}: {
  popups: ReturnType<typeof useQuizScreen>['popups'];
  target: (e: QuestionEntry) => ReportTarget;
  onRestart: () => void;
  restartRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <>
      {popups.confirming ? (
        <RestartDialog
          onConfirm={() => {
            popups.setConfirming(false);
            onRestart();
          }}
          onCancel={() => {
            popups.setConfirming(false);
            restartRef.current?.focus();
          }}
        />
      ) : null}
      <ImageViewer image={popups.zoom} onClose={() => popups.setZoom(null)} />
      <ReportDialog
        target={popups.reporting ? target(popups.reporting) : null}
        onClose={() => popups.setReporting(null)}
        onSent={() => {
          popups.setReporting(null);
          popups.setThanks(true);
        }}
      />
      {popups.thanks ? <StatusToast>{sharedStrings.reportThanks}</StatusToast> : null}
    </>
  );
}

function ResultsScreen({
  crumbs,
  course,
  actions,
  ...results
}: {
  crumbs: ReactNode;
  round: Round;
  entries: Map<string, QuestionEntry>;
  sectionName: string | null;
  course: CourseRef;
  actions: RoundActions;
  onReport: (entry: QuestionEntry) => void;
}) {
  return (
    <>
      {crumbs}
      <Results
        {...results}
        onRepeatAll={actions.repeatAll}
        onRepeatWrong={actions.repeatWrong}
        onHome={actions.home}
      />
      <p className="wrap wide qz-foot">
        <Link to={paths.course(course)} className="underline">
          {s.results.course}
        </Link>
      </p>
    </>
  );
}

export function QuizScreen(props: {
  quiz: QuizDetail;
  section: QuizSectionSummary;
  detail: QuizSectionDetail;
  course: CourseRef & { name: string; emoji: string };
  assessment: { id: string; name: string } | null;
  saved: SavedQuiz;
  fromTab: boolean;
  inRound: boolean;
  topics?: readonly string[] | null;
  heading?: string | null;
  crumbs: ReactNode;
}) {
  const { quiz, section, course, crumbs } = props;
  const view = useQuizScreen({ ...props, topics: props.topics ?? null });
  const { session, screen, popups, restartRef } = view;
  const { round, preferences, current, entries, actions } = session;

  return (
    <>
      {screen === 'question' ? (
        <QuizBar
          round={round}
          backLabel={backLabel(course.name, props.assessment?.name)}
          restartRef={restartRef}
          onBack={actions.home}
          onRestart={() => popups.setConfirming(true)}
          onFinish={actions.finishNow}
        />
      ) : null}

      {session.saving === 'failed' ? (
        <SaveWarning wide={screen !== 'question'} onRetry={actions.retrySaving} />
      ) : null}

      {screen === 'cover' ? (
        <>
          {crumbs}
          <Cover
            quiz={quiz}
            section={section}
            round={round}
            preferences={preferences}
            onChoose={actions.choose}
            onStart={actions.start}
            onResume={actions.resume}
            onDiscard={actions.discard}
            onTab={view.tab}
            focusTab={props.fromTab}
            heading={props.heading ?? null}
          />
          {quiz.footer ? <Html as="p" className="wrap wide qz-foot" html={quiz.footer} /> : null}
        </>
      ) : null}

      {screen === 'question' && round && current ? (
        <>
          <QuestionCard
            round={round}
            entry={current}
            sectionLabel={section.label}
            sectionIndex={view.sectionIndex}
            revealed={view.revealed}
            onReveal={view.reveal}
            onAnswer={actions.answer}
            onSelfAssess={actions.selfAssess}
            onNext={actions.next}
            onSkip={actions.skip}
            onZoom={popups.setZoom}
            onReport={() => popups.setReporting(current)}
          />
        </>
      ) : null}

      {screen === 'results' && round ? (
        <ResultsScreen
          crumbs={crumbs}
          round={round}
          entries={entries}
          sectionName={quiz.sections.length > 1 ? section.name : null}
          course={course}
          actions={actions}
          onReport={popups.setReporting}
        />
      ) : null}

      <QuizPopups
        popups={popups}
        target={view.target}
        onRestart={actions.restart}
        restartRef={restartRef}
      />
    </>
  );
}
