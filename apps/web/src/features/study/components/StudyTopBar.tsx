// The study screen's top bar: «Volver», what is left (the three counts, or the time in the simple mode), the card's
// flag and «Más» (in the simple mode, with «Deshacer» beside it, the card's material in it and its one-time tip on it).
import { Flag, Undo2 } from 'lucide-react';
import type { Counts } from '@qv/srs';
import { FLAGS } from '@qv/study';
import type { Shown } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import { BackButton } from '../../../shared/ui/BackButton';
import { answerBar, button } from '../../../shared/ui/styles';
import { keys } from '../../../shared/ui/keys';
import { studyBackLabel } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { CountNumbers, DayLoad } from '../../progress/components/DeckCounts';
import type { StudyActions } from '../hooks/useStudySession';
import { useTip } from '../../tips/hooks/useTip';
import { useCardMaterial } from '../hooks/useCardMaterial';
import { MoreMenu } from './MoreMenu';
import { SimpleMenu } from './SimpleMenu';
import { studyTopBarStrings } from './strings/StudyTopBar.strings';
import { reviewMenuStrings } from './strings/ReviewMenu.strings';

/** «Marcar para revisar» is one flag; a card flagged otherwise in the full mode also counts as marked. */
const REVIEW_FLAG = 1;

export function StudyTopBar({
  counts,
  shown,
  flag: currentFlag,
  canUndo,
  act,
  node,
  deckPath,
  full,
  medianAnswerMs,
  onReport,
  revealed,
  answered,
  unsaved,
  held,
}: {
  counts: Counts;
  shown: Shown | null;
  flag: number;
  canUndo: boolean;
  act: StudyActions;
  node: CourseDeckNode;
  deckPath: string;
  full: boolean;
  medianAnswerMs: number | null;
  onReport: () => void;
  revealed: boolean;
  /** Cards answered in this session: the tip shows from the second answer on. */
  answered: number;
  /** How many changes wait for the connection: while any does, the bar says so where it tells what is left. */
  unsaved: number;
  /** Too many wait: nothing else is taken, so the menus are off. */
  held: boolean;
}) {
  const material = useCardMaterial(shown?.entry.deckId);
  const tip = useTip('tip-material', !full && revealed && !!material && answered > 0);
  return (
    <div className={`${answerBar} pb-2`}>
      <BackButton to={deckPath} label={studyBackLabel(node)} className="justify-self-start" />
      <div
        className="flex min-w-0 justify-center"
        aria-label={
          unsaved > 0 ? studyTopBarStrings.topBar.connection : studyTopBarStrings.topBar.left
        }
        role="group"
      >
        <Left
          counts={counts}
          shown={shown}
          full={full}
          medianAnswerMs={medianAnswerMs}
          unsaved={unsaved}
        />
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <FlagMark full={full} flag={currentFlag} />
        {full ? (
          <MoreMenu
            disabled={!shown || held}
            onBury={act.hide}
            onFlag={act.flag}
            onUndo={act.undo}
            canUndo={canUndo}
            currentFlag={currentFlag}
            optionsPath={paths.deckOptions({ deck: node.id })}
            onReport={onReport}
          />
        ) : (
          <>
            <UndoButton canUndo={canUndo} onUndo={act.undo} />
            <SimpleMenu
              disabled={!shown || held}
              marked={currentFlag !== 0}
              onHide={act.hide}
              onMark={() => act.flag(currentFlag || REVIEW_FLAG)}
              onReport={onReport}
              material={material}
              revealed={revealed}
              hint={tip.show}
              onHintSeen={tip.close}
            />
          </>
        )}
      </div>
    </div>
  );
}

// What is left of the day, or how much waits for the connection while it is down: in the same place, so nothing moves.
function Left({
  counts,
  shown,
  full,
  medianAnswerMs,
  unsaved,
}: {
  counts: Counts;
  shown: Shown | null;
  full: boolean;
  medianAnswerMs: number | null;
  unsaved: number;
}) {
  if (unsaved > 0) {
    return (
      <span
        title={studyTopBarStrings.topBar.offlineTitle}
        className="truncate text-sm font-medium tabular-nums sm:text-base"
      >
        {studyTopBarStrings.topBar.offline(unsaved)}
      </span>
    );
  }
  return full ? (
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
  );
}

function FlagMark({ full, flag }: { full: boolean; flag: number }) {
  const flagInfo = FLAGS.find((f) => f.flag === flag);
  return flagInfo && full ? (
    <Flag
      className="size-5"
      style={{ color: flagInfo.color, fill: flagInfo.color }}
      role="img"
      aria-label={studyTopBarStrings.topBar.flag(flagInfo.label)}
    />
  ) : flag && !full ? (
    <Flag
      className="size-5 flex-none text-brand"
      style={{ fill: 'currentColor' }}
      role="img"
      aria-label={reviewMenuStrings.topBar.marked}
    />
  ) : full ? null : (
    // Its place stays: marking does not move what is on top.
    <span className="size-5 flex-none" aria-hidden="true" />
  );
}

function UndoButton({ canUndo, onUndo }: { canUndo: boolean; onUndo: () => void }) {
  return (
    <button
      type="button"
      disabled={!canUndo}
      onClick={(e) => {
        onUndo();
        // Focus does not stay here: space and Enter have to keep showing the answer.
        e.currentTarget.blur();
      }}
      className={`${button.base} ${button.ghost}`}
      aria-label={studyTopBarStrings.topBar.undo}
      title={studyTopBarStrings.topBar.undoTitle(keys('Ctrl+Z'))}
    >
      <Undo2 className="size-5 sm:size-4" aria-hidden="true" />
      <span className="hidden sm:inline">{studyTopBarStrings.topBar.undo}</span>
    </button>
  );
}
