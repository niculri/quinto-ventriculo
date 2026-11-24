// An assessment's «Gymkana» page: its stations, studying them as Anki cards, and the writing mode with its choices.
import { useNavigate } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { Canonical } from '../../../shared/ui/Canonical';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { useTitle } from '../../../shared/hooks/useTitle';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { SectionFrame } from '../../courses/components/SectionFrame';
import { useGymkana } from '../hooks/useGymkana';
import { useCaRound } from '../hooks/useCaRound';
import { CaResume } from '../components/CaResume';
import { CaStart } from '../components/CaStart';
import { AnkiBlock } from '../components/AnkiBlock';
import { countBy } from '../model/stations';
import type { GymkanaStations } from '../model/stations';
import type { SavedSection } from '../../quiz/api/repository';
import { gymkanaPageStrings as s } from './strings/GymkanaPage.strings';

export function GymkanaPage() {
  const g = useGymkana();
  useTitle(s.title);
  const { catalog, found, number, assessment, node } = g;
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  if (!found || !assessment || !node || !g.quizId) return <NotFoundPage />;
  const { semester, course } = found;
  if (String(semester.number) !== number) {
    return <Canonical path={paths.gymkana(course, assessment.id)} />;
  }
  let body;
  if (g.error) body = <ErrorWithRetry error={g.error} onRetry={g.retry} />;
  else if (!g.data || !g.savedReady) body = <Loading text={s.preparing} />;
  else
    body = (
      <Cover
        key={g.quizId}
        quizId={g.quizId}
        data={g.data}
        saved={g.saved}
        node={node}
        write={paths.gymkanaWrite(course, assessment.id)}
      />
    );
  return (
    <SectionFrame semester={semester} course={course} assessment={assessment} title={s.title}>
      {body}
    </SectionFrame>
  );
}

function Summary({ data }: { data: GymkanaStations }) {
  const priorities = [...countBy(data.stations, 'priority')].sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );
  return (
    <p className="mt-6 text-sm text-muted">
      {s.stations(data.stations.length)}
      {priorities.length > 1
        ? ` · ${s.ofPriority(priorities[0]![1], Number(priorities[0]![0]))}`
        : ''}
    </p>
  );
}

function Cover({
  quizId,
  data,
  saved,
  node,
  write,
}: {
  quizId: string;
  data: GymkanaStations;
  saved: SavedSection | null;
  node: CourseDeckNode;
  write: string;
}) {
  const ca = useCaRound({ quizId, data, saved });
  const navigate = useNavigate();
  return (
    <>
      <Summary data={data} />
      <AnkiBlock node={node} />
      <section className="mt-8" aria-labelledby="gymkana-write">
        <h2 id="gymkana-write" className="text-lg font-semibold">
          {s.write}
        </h2>
        <p className="mt-1 text-sm text-muted">{s.intro}</p>
        {ca.round ? <CaResume round={ca.round} to={write} onDiscard={ca.discard} /> : null}
        <CaStart
          data={data}
          preferences={ca.preferences}
          replacing={!!ca.round && !ca.round.finished}
          onChoose={ca.choose}
          onStart={() => {
            ca.start();
            void navigate(write);
          }}
        />
      </section>
    </>
  );
}
