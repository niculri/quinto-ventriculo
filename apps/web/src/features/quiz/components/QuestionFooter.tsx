// Under a question: its keys, «Saltar» (hidden once answered, so «Siguiente» does not move) and «Siguiente».
import type { RefObject } from 'react';
import { keys } from '../../../shared/ui/keys';
import { quizStrings as s } from '../strings';

function Shortcuts({ choice, options }: { choice: boolean; options: number }) {
  const k = s.shortcuts;
  return choice ? (
    <>
      <kbd>1</kbd>–<kbd>{options}</kbd>
      {k.answer}
      <kbd>{keys('Enter')}</kbd>
      {k.next}
      <kbd>{k.skipKey}</kbd>
      {k.skip}
    </>
  ) : (
    <>
      <kbd>{k.space}</kbd>
      {k.reveal}
      <kbd>1</kbd>
      {k.knewIt}
      <kbd>2</kbd>
      {k.didNot}
      <kbd>{keys('Enter')}</kbd>
      {k.next}
      <kbd>{k.skipKey}</kbd>
      {k.skip}
    </>
  );
}

export function QuestionFooter({
  choice,
  options,
  done,
  skippable,
  last,
  nextRef,
  onSkip,
  onNext,
}: {
  choice: boolean;
  options: number;
  done: boolean;
  skippable: boolean;
  last: boolean;
  nextRef: RefObject<HTMLButtonElement | null>;
  onSkip: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pie">
      <span className="atajo">
        {s.shortcuts.title}
        <Shortcuts choice={choice} options={options} />
      </span>
      <span className="pacc">
        <button
          type="button"
          className="btn2"
          style={done ? { visibility: 'hidden' } : undefined}
          aria-hidden={done || undefined}
          tabIndex={done ? -1 : undefined}
          disabled={done || !skippable}
          onClick={onSkip}
          title={skippable ? s.question.skipHint : s.question.skipLast}
        >
          {s.question.skip}
        </button>
        <button ref={nextRef} type="button" className="btn" disabled={!done} onClick={onNext}>
          {last ? s.question.seeResult : s.question.next}
        </button>
      </span>
    </div>
  );
}
