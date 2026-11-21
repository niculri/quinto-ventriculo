// The card being studied and what is under it: its answers and, in the simple mode, «Ver apunte» and «Preguntas».
import type { Shown } from '@qv/study';
import type { useTip } from '../../tips/hooks/useTip';
import type { StudyActions } from '../hooks/useStudySession';
import type { CardMaterial } from '../model/material';
import { MaterialRow } from './MaterialRow';
import { MaterialTip } from './MaterialTip';
import { StudyAnswers } from './StudyAnswers';
import { StudyCard } from './StudyCard';
import { studyStrings } from '../strings';

export function StudyCardArea({
  act,
  shown,
  revealed,
  failed,
  night,
  full,
  fourButtons,
  material,
  tip,
}: {
  act: StudyActions;
  shown: Shown;
  revealed: boolean;
  failed: boolean;
  night: boolean;
  full: boolean;
  fourButtons: boolean;
  material: CardMaterial | null;
  tip: ReturnType<typeof useTip>;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <StudyCard
          entry={shown.entry}
          revealed={revealed}
          night={night}
          onMissing={() => act.skipMissing(shown.entry)}
        />
      </div>
      <div className="py-3" aria-label={studyStrings.answer} role="group">
        <StudyAnswers
          act={act}
          shown={shown}
          revealed={revealed}
          fourButtons={fourButtons}
          full={full}
          failed={failed}
        />
        {!full ? (
          <MaterialRow material={material} revealed={revealed}>
            {tip.shown ? <MaterialTip show={tip.show} onClose={tip.close} /> : null}
          </MaterialRow>
        ) : null}
      </div>
    </>
  );
}
