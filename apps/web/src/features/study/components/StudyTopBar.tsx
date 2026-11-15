// The study screen's top bar: «Volver», what is left (the three counts, or the time in the simple mode), the card's
// flag and «Más» (in the simple mode, with «Deshacer» beside it).
import { Flag, Undo2 } from 'lucide-react';
import type { Counts } from '@qv/srs';
import { FLAGS } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import { BackButton } from '../../../shared/ui/BackButton';
import { answerBar, button } from '../../../shared/ui/styles';
import { keys } from '../../../shared/ui/keys';
import { studyBackLabel } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { CountNumbers, DayLoad } from '../../progress/components/DeckCounts';
import type { StudySession } from '../api/StudySession';
import { MoreMenu } from './MoreMenu';
import { SimpleMenu } from './SimpleMenu';
import { studyStrings } from '../strings';

/** «Marcar para revisar» is one flag; a card flagged otherwise in the full mode also counts as marked. */
const REVIEW_FLAG = 1;

export function StudyTopBar({
  session,
  counts,
  node,
  deckPath,
  full,
  medianAnswerMs,
  onReport,
}: {
  session: StudySession;
  counts: Counts;
  node: CourseDeckNode;
  deckPath: string;
  full: boolean;
  medianAnswerMs: number | null;
  onReport: () => void;
}) {
  const { shown } = session;
  const currentFlag = shown ? (session.row(shown.entry)?.flag ?? 0) : 0;
  return (
    <div className={`${answerBar} pb-2`}>
      <BackButton to={deckPath} label={studyBackLabel(node)} className="justify-self-start" />
      <div
        className="flex min-w-0 justify-center"
        aria-label={studyStrings.topBar.left}
        role="group"
      >
        {full ? (
          <CountNumbers
            counts={counts}
            current={shown?.entry.kind ?? null}
            className="inline-flex text-lg"
          />
        ) : (
          <DayLoad
            counts={counts}
            medianAnswerMs={medianAnswerMs}
            empty=""
            className="truncate text-sm font-medium sm:text-base"
          />
        )}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <FlagMark full={full} flag={currentFlag} />
        {full ? (
          <MoreMenu
            disabled={!shown}
            onBury={(a) => session.hide(a)}
            onFlag={(f) => session.flag(f)}
            onUndo={() => session.undo()}
            canUndo={session.canUndo}
            currentFlag={currentFlag}
            optionsPath={paths.deckOptions({ deck: node.id })}
            onReport={onReport}
          />
        ) : (
          <>
            <UndoButton session={session} />
            <SimpleMenu
              disabled={!shown}
              marked={currentFlag !== 0}
              onHide={(a) => session.hide(a)}
              onMark={() => session.flag(currentFlag || REVIEW_FLAG)}
              onReport={onReport}
            />
          </>
        )}
      </div>
    </div>
  );
}

function FlagMark({ full, flag }: { full: boolean; flag: number }) {
  const flagInfo = FLAGS.find((f) => f.flag === flag);
  return flagInfo && full ? (
    <Flag
      className="size-5"
      style={{ color: flagInfo.color, fill: flagInfo.color }}
      role="img"
      aria-label={studyStrings.topBar.flag(flagInfo.label)}
    />
  ) : flag && !full ? (
    <Flag
      className="size-5 flex-none text-brand"
      style={{ fill: 'currentColor' }}
      role="img"
      aria-label={studyStrings.topBar.marked}
    />
  ) : full ? null : (
    // Its place stays: marking does not move what is on top.
    <span className="size-5 flex-none" aria-hidden="true" />
  );
}

function UndoButton({ session }: { session: StudySession }) {
  return (
    <button
      type="button"
      disabled={!session.canUndo}
      onClick={(e) => {
        session.undo();
        // Focus does not stay here: space and Enter have to keep showing the answer.
        e.currentTarget.blur();
      }}
      className={`${button.base} ${button.ghost}`}
      aria-label={studyStrings.topBar.undo}
      title={studyStrings.topBar.undoTitle(keys('Ctrl+Z'))}
    >
      <Undo2 className="size-5 sm:size-4" aria-hidden="true" />
      <span className="hidden sm:inline">{studyStrings.topBar.undo}</span>
    </button>
  );
}
