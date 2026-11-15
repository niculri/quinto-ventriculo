// The study screen of a deck: the session's card and its answers, the menus, the keyboard and the end screens.
import { useState } from 'react';
import { paths } from '../../../shared/lib/paths';
import { studyScreen } from '../../../shared/ui/styles';
import { useDarkMode } from '../../../shared/hooks/useDarkMode';
import { deckTitle } from '../../catalog/model/tree';
import { descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { cardKey } from '@qv/study';
import type { StudyData } from '@qv/study';
import { DaySummary } from './DaySummary';
import { useCardMaterial } from '../hooks/useCardMaterial';
import { useTip } from '../../tips/useTip';
import { LiveToast } from '../../../shared/ui/Toast';
import { useTitle } from '../../../shared/hooks/useTitle';
import {
  useCardTurn,
  useDoneSummary,
  useSessionLifecycle,
  useStudySession,
} from '../hooks/useStudySession';
import { useStudyShortcuts } from '../hooks/useStudyShortcuts';
import { useCardReport } from '../hooks/useCardReport';
import { useOpeningLoad } from '../hooks/useOpeningLoad';
import { ReportEntry } from './ReportEntry';
import { SessionStatus } from './SessionStatus';
import { StudyCardArea } from './StudyCardArea';
import { StudyEnd } from './StudyEnd';
import { HeavyDayNotice, SessionStopped } from './StudyNotices';
import { StudyTopBar } from './StudyTopBar';
import { Welcome } from './Welcome';

export function Reviewer({
  node,
  rootId,
  initial,
}: {
  node: CourseDeckNode;
  rootId: string;
  initial: StudyData;
}) {
  const night = useDarkMode();
  const { session, version } = useStudySession(initial, rootId);

  const rootName = deckTitle(node);
  const [scopeDecks] = useState(() => new Set(descendants(node).map((n) => n.id)));
  const deckPath = paths.deck(node.ref);
  const { shown, revealed, toast, failure } = session;
  const full = initial.prefs.fullAnki;
  const fourButtons = initial.prefs.fourButtons;
  const material = useCardMaterial(shown?.entry.deckId);
  const tip = useTip(
    'tip-material',
    !full && revealed && !!material && session.answeredInSession > 0,
  );
  const load = useOpeningLoad(session, full, initial.plan.medianAnswerMs);
  const report = useCardReport();
  const message = toast ?? (report.sent ? 'Gracias: tu reporte le llegó al autor.' : null);

  useTitle(`Estudiar ${rootName}`);
  useSessionLifecycle(session);
  useStudyShortcuts(session, full, fourButtons);

  const counts = session.counts();
  const done = !shown && version > 0;
  const withSummary = useDoneSummary(done, () => session.answeredToday(scopeDecks));
  const summary = withSummary ? (
    <DaySummary node={node} prefs={initial.prefs} saved={() => session.saved()} />
  ) : null;
  const turn = useCardTurn(shown ? cardKey(shown.entry) : '');

  return (
    <div className={studyScreen}>
      <StudyTopBar
        session={session}
        counts={counts}
        node={node}
        deckPath={deckPath}
        full={full}
        medianAnswerMs={initial.plan.medianAnswerMs}
        onReport={() => report.open(shown?.entry ?? null)}
      />

      {load.heavy && shown ? (
        <HeavyDayNotice
          opening={load.opening}
          minutes={load.minutes}
          deckPath={deckPath}
          onGoOn={load.goOn}
        />
      ) : null}

      {failure ? <SessionStopped failure={failure} /> : null}

      {shown ? (
        <StudyCardArea
          session={session}
          shown={shown}
          night={night}
          full={full}
          fourButtons={fourButtons}
          material={material}
          tip={tip}
        />
      ) : (
        <StudyEnd
          session={session}
          done={done}
          full={full}
          node={node}
          deckPath={deckPath}
          summary={summary}
        />
      )}

      <SessionStatus shown={!!shown} revealed={revealed} turn={turn} />
      <LiveToast message={message} />

      {!full && !initial.prefs.welcomeSeen && shown ? <Welcome prefs={initial.prefs} /> : null}

      {report.reporting ? (
        <ReportEntry entry={report.reporting} onClose={report.close} onSent={report.onSent} />
      ) : null}
    </div>
  );
}
