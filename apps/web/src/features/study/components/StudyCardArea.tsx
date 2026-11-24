// The card being studied and its answers under it.
import type { Shown } from '@qv/study';
import type { StudyActions } from '../hooks/useStudySession';
import { StudyAnswers } from './StudyAnswers';
import { StudyCard } from './StudyCard';
import { reviewScreenStrings } from './strings/ReviewScreen.strings';

export function StudyCardArea({
  act,
  shown,
  revealed,
  failed,
  night,
  full,
  fourButtons,
}: {
  act: StudyActions;
  shown: Shown;
  revealed: boolean;
  failed: boolean;
  night: boolean;
  full: boolean;
  fourButtons: boolean;
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
      <div className="py-3" aria-label={reviewScreenStrings.answer} role="group">
        <StudyAnswers
          act={act}
          shown={shown}
          revealed={revealed}
          fourButtons={fourButtons}
          full={full}
          failed={failed}
        />
      </div>
    </>
  );
}
