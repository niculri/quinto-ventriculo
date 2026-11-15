// Under the card: «Mostrar respuesta», then the answer buttons with their intervals (two, or Anki's four).
import type { Shown } from '@qv/study';
import { button } from '../../../shared/ui/styles';
import type { StudySession } from '../api/StudySession';
import { RATINGS } from './ratings';
import { studyStrings } from '../strings';

export function StudyAnswers({
  session,
  shown,
  revealed,
  fourButtons,
  full,
  failed,
}: {
  session: StudySession;
  shown: Shown;
  revealed: boolean;
  fourButtons: boolean;
  full: boolean;
  failed: boolean;
}) {
  // Simple mode: «Mostrar respuesta» as high as the buttons that replace it, so the card does not change size.
  const barHeight = full ? '' : 'h-[4.125rem]';
  return revealed ? (
    <div
      className={`mx-auto grid gap-2 ${fourButtons ? 'max-w-2xl grid-cols-4' : 'max-w-md grid-cols-2'}`}
    >
      {RATINGS.filter((r) => fourButtons || r.rating === 1 || r.rating === 3).map(
        ({ rating, label, className }) => (
          <button
            key={rating}
            type="button"
            onClick={() => session.answer(rating)}
            className={`${button.base} ${button.secondary} flex-col gap-0.5 px-1 py-2 ${barHeight}`}
            aria-label={studyStrings.ratingLabel(label, shown.labels[rating - 1]!)}
            disabled={failed}
          >
            <span className="text-xs text-muted tabular-nums">{shown.labels[rating - 1]}</span>
            <span className={`font-semibold ${className}`}>{label}</span>
          </button>
        ),
      )}
    </div>
  ) : (
    <div className="mx-auto flex max-w-2xl">
      <button
        type="button"
        onClick={() => session.reveal()}
        className={`${button.base} ${button.primary} w-full py-3 text-base ${barHeight}`}
      >
        {studyStrings.showAnswer}
      </button>
    </div>
  );
}
