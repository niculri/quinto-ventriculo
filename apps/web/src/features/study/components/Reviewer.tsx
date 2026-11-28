// The study screen of a deck: the session's card and its answers, the menus, the keyboard and the end screens.
import { useState } from 'react';
import { paths } from '../../../shared/lib/paths';
import { studyScreen } from '../../../shared/ui/styles';
import { useDarkMode } from '../../../shared/hooks/useDarkMode';
import { deckTitle } from '../../catalog/model/tree';
import { descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import {
  answeredToday,
  canUndo,
  cardKey,
  congrats,
  countsOf,
  flagOf,
  hasSeen,
  isDone,
} from '@qv/study';
import type { StudyData } from '@qv/study';
import { DaySummary } from './DaySummary';
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
import { useConnectionMessage } from '../hooks/useConnectionMessage';
import { useOpeningLoad } from '../hooks/useOpeningLoad';
import { failureText, toastText } from '../model/messages';
import { ReportEntry } from './ReportEntry';
import { SessionStatus } from './SessionStatus';
import { StudyCardArea } from './StudyCardArea';
import { StudyEnd } from './StudyEnd';
import { HeavyDayNotice, SessionStopped } from './StudyNotices';
import { StudyTopBar } from './StudyTopBar';
import { Welcome } from './Welcome';
import { sharedStrings } from '../../../shared/strings/shared.strings';
import { reviewerStrings } from './strings/Reviewer.strings';

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
  const { state, act, saves, unsaved, held } = useStudySession(initial, rootId);

  const rootName = deckTitle(node);
  const [scopeDecks] = useState(() => new Set(descendants(node).map((n) => n.id)));
  const deckPath = paths.deck(node.ref);
  const { shown, revealed, failure } = state;
  const full = initial.prefs.fullAnki;
  const fourButtons = initial.prefs.fourButtons;
  const load = useOpeningLoad(countsOf(state), full, initial.plan.medianAnswerMs);
  const report = useCardReport();
  const toast = state.toast ? toastText(state.toast, full) : null;
  const connection = useConnectionMessage(unsaved, held);
  const message = connection ?? toast ?? (report.sent ? sharedStrings.reportThanks : null);

  useTitle(reviewerStrings.studyTitle(rootName));
  useSessionLifecycle(act, saves);
  useStudyShortcuts(act, revealed, full, fourButtons);

  const done = isDone(state);
  const withSummary = useDoneSummary(done, () => answeredToday(state, scopeDecks));
  const summary = withSummary ? (
    <DaySummary node={node} prefs={initial.prefs} saved={() => saves.saved()} />
  ) : null;
  const turn = useCardTurn(shown ? cardKey(shown.entry) : '');
  // «Reportar error» is disabled while no card is shown.
  /* v8 ignore next */
  const reportShown = () => report.open(shown?.entry ?? null);

  return (
    <div className={studyScreen}>
      {/* A screen reader says where it is; the end of the session has its own title. */}
      {shown ? <h1 className="sr-only">{reviewerStrings.studyTitle(rootName)}</h1> : null}
      <StudyTopBar
        counts={countsOf(state)}
        shown={shown}
        flag={flagOf(state)}
        canUndo={canUndo(state) && !held}
        act={act}
        node={node}
        deckPath={deckPath}
        full={full}
        medianAnswerMs={initial.plan.medianAnswerMs}
        onReport={reportShown}
        revealed={revealed}
        answered={state.answeredInSession}
        unsaved={unsaved}
        held={held}
      />

      {load.heavy && shown ? (
        <HeavyDayNotice
          opening={load.opening}
          minutes={load.minutes}
          deckPath={deckPath}
          onGoOn={load.goOn}
        />
      ) : null}

      {failure ? <SessionStopped failure={failureText(failure)} /> : null}

      {shown ? (
        <StudyCardArea
          act={act}
          shown={shown}
          revealed={revealed}
          failed={!!failure || held}
          night={night}
          full={full}
          fourButtons={fourButtons}
        />
      ) : (
        <StudyEnd
          info={done ? congrats(state) : null}
          hasSeen={(id) => hasSeen(state, id)}
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
