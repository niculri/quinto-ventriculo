// An assessment's «Gymkana» page: its stations and its two modes as tabs, «Modo Anki» (its cards) and «Modo CA»
// (writing the name, with its choices); the tab chosen is in the address (`?modo=ca`).
import { useNavigate, useSearchParams } from 'react-router';
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
import { MODE_PARAM, ModeTabs, modePanelId, modeTabId } from '../components/ModeTabs';
import type { GymkanaMode } from '../components/ModeTabs';
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
  const [search, setSearch] = useSearchParams();
  const mode: GymkanaMode = search.get(MODE_PARAM) === 'ca' ? 'ca' : 'anki';
  return (
    <>
      <Summary data={data} />
      <ModeTabs
        active={mode}
        onMode={(m) => {
          setSearch(m === 'ca' ? { [MODE_PARAM]: 'ca' } : {}, { replace: true });
        }}
      />
      <section
        id={modePanelId(mode)}
        role="tabpanel"
        aria-labelledby={modeTabId(mode)}
        className="mt-4"
      >
        {mode === 'anki' ? (
          <AnkiBlock node={node} />
        ) : (
          <>
            <p className="text-sm text-muted">{s.intro}</p>
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
          </>
        )}
      </section>
    </>
  );
}
