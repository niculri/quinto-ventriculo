// Under the card: «Mostrar respuesta», then the answer buttons with their intervals (two, or Anki's four).
import { useRef } from 'react';
import type { MouseEvent } from 'react';
import type { Shown } from '@qv/study';
import { button } from '../../../shared/ui/styles';
import type { StudyActions } from '../hooks/useStudySession';
import { ANSWER_BUTTON, ANSWER_ROW, RATINGS } from './ratings';
import { studyAnswersStrings } from './strings/StudyAnswers.strings';
import { reviewScreenStrings } from './strings/ReviewScreen.strings';

/** A second tap this soon after the one on «Mostrar respuesta», and this near it, is a double tap, not an answer. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 24;

export function StudyAnswers({
  act,
  shown,
  revealed,
  fourButtons,
  full,
  failed,
}: {
  act: StudyActions;
  shown: Shown;
  revealed: boolean;
  fourButtons: boolean;
  full: boolean;
  failed: boolean;
}) {
  // Simple mode: «Mostrar respuesta» as high as the buttons that replace it, so the card does not change size.
  const barHeight = full ? '' : 'h-[4.125rem]';
  const revealTapRef = useRef({ at: Number.NEGATIVE_INFINITY, x: 0, y: 0 });
  // Only a tap or a click: `detail` is 0 when the button is pressed with the keyboard.
  const answer = (event: MouseEvent, rating: (typeof RATINGS)[number]['rating']) => {
    const tap = revealTapRef.current;
    const near = Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= DOUBLE_TAP_PX;
    if (event.detail > 0 && near && event.timeStamp - tap.at < DOUBLE_TAP_MS) return;
    act.answer(rating);
  };
  return revealed ? (
    <div className={`${ANSWER_ROW} ${fourButtons ? 'grid-cols-4' : 'grid-cols-2'}`}>
      {RATINGS.filter((r) => fourButtons || r.rating === 1 || r.rating === 3).map(
        ({ rating, label, className }) => (
          <button
            key={rating}
            type="button"
            onClick={(event) => answer(event, rating)}
            className={`${ANSWER_BUTTON} flex-col gap-0.5 px-1 py-2 ${barHeight}`}
            aria-label={studyAnswersStrings.ratingLabel(label, shown.labels[rating - 1]!)}
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
        onClick={(event) => {
          // A click without a place on the screen (the keyboard, an assistive tool) is not a tap to guard.
          if (event.clientX !== 0 || event.clientY !== 0) {
            revealTapRef.current = { at: event.timeStamp, x: event.clientX, y: event.clientY };
          }
          act.reveal();
        }}
        className={`${button.base} ${button.primary} w-full py-3 text-base ${barHeight}`}
      >
        {reviewScreenStrings.showAnswer}
      </button>
    </div>
  );
}
