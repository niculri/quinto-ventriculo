// The writing mode's round: one station after another and, at the end, the result. Without a round it goes back
// to the gymkana's page; reloading keeps the round where it was.
import { Navigate } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { BackButton } from '../../../shared/ui/BackButton';
import { answerBar, button, studyScreen } from '../../../shared/ui/styles';
import { useTitle } from '../../../shared/hooks/useTitle';
import type { SavedSection } from '../../quiz/api/repository';
import { useGymkana } from '../hooks/useGymkana';
import { useCaRound } from '../hooks/useCaRound';
import { CaResults } from '../components/CaResults';
import { StationScreen } from '../components/StationScreen';
import { caTab } from '../components/ModeTabs';
import type { GymkanaStations } from '../model/stations';
import { gymkanaWritePageStrings as s } from './strings/GymkanaWritePage.strings';

export function GymkanaWritePage() {
  const g = useGymkana();
  useTitle(s.title);
  const { found, assessment, node } = g;
  const cover = found && assessment ? caTab(paths.gymkana(found.course, assessment.id)) : null;
  let body;
  if (g.catalog.isError)
    body = <ErrorWithRetry error={g.catalog.error} onRetry={() => void g.catalog.refetch()} />;
  else if (!g.catalog.data) body = <Loading />;
  else if (!cover || !node || !g.quizId) return <NotFoundPage />;
  else if (g.error) body = <ErrorWithRetry error={g.error} onRetry={g.retry} />;
  else if (!g.data || !g.savedReady) body = <Loading />;
  else
    return (
      <div className={studyScreen}>
        <Round key={g.quizId} quizId={g.quizId} data={g.data} saved={g.saved} cover={cover} />
      </div>
    );
  return (
    <div className={studyScreen}>
      <div className={`${answerBar} min-h-11 pb-2`}>
        <BackButton to={cover ?? paths.home} label={s.back} className="justify-self-start" />
      </div>
      {body}
    </div>
  );
}

function Round({
  quizId,
  data,
  saved,
  cover,
}: {
  quizId: string;
  data: GymkanaStations;
  saved: SavedSection | null;
  cover: string;
}) {
  const ca = useCaRound({ quizId, data, saved });
  const { round, current } = ca;
  if (!round) return <Navigate to={cover} replace />;
  const failed =
    ca.saving === 'failed' ? (
      <p role="alert" className="mb-2 flex items-center gap-3 text-sm">
        {s.saveFailed}
        <button
          type="button"
          onClick={ca.retrySaving}
          className={`${button.base} ${button.secondary} py-1`}
        >
          {s.retry}
        </button>
      </p>
    ) : null;
  if (round.finished || !current) {
    return (
      <>
        <div className={`${answerBar} min-h-11 pb-2`}>
          <BackButton to={cover} label={s.back} className="justify-self-start" />
        </div>
        {failed}
        <CaResults
          round={round}
          byKey={ca.byKey}
          cover={cover}
          onRepeatWrong={ca.repeatWrong}
          onToggle={ca.toggle}
        />
      </>
    );
  }
  return (
    <>
      {failed}
      <StationScreen
        key={`${round.id}:${String(round.index)}`}
        round={round}
        station={current}
        back={cover}
        backLabel={s.back}
        onSubmit={ca.submit}
        onToggle={ca.toggle}
        onNext={ca.next}
      />
    </>
  );
}
