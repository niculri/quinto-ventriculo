// Under a question: its keys, «Saltar» (hidden once answered, so «Siguiente» does not move) and «Siguiente».
import type { RefObject } from 'react';
import { keys } from '../../../shared/ui/keys';
import { questionFooterStrings } from './strings/QuestionFooter.strings';

function Shortcuts({ choice, options }: { choice: boolean; options: number }) {
  return choice ? (
    <>
      <kbd>1</kbd>–<kbd>{options}</kbd>
      {questionFooterStrings.shortcuts.answer}
      <kbd>{keys('Enter')}</kbd> {questionFooterStrings.shortcuts.next}
      <kbd>{questionFooterStrings.shortcuts.skipKey}</kbd>
      {questionFooterStrings.shortcuts.skip}
    </>
  ) : (
    <>
      <kbd>{questionFooterStrings.shortcuts.space}</kbd>
      {questionFooterStrings.shortcuts.reveal}
      <kbd>1</kbd>
      {questionFooterStrings.shortcuts.knewIt}
      <kbd>2</kbd>
      {questionFooterStrings.shortcuts.didNot} <kbd>{keys('Enter')}</kbd>
      {` ${questionFooterStrings.shortcuts.next}`}
      <kbd>{questionFooterStrings.shortcuts.skipKey}</kbd>
      {questionFooterStrings.shortcuts.skip}
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
        {questionFooterStrings.shortcuts.title}
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
          title={
            skippable
              ? questionFooterStrings.question.skipHint
              : questionFooterStrings.question.skipLast
          }
        >
          {questionFooterStrings.question.skip}
        </button>
        <button ref={nextRef} type="button" className="btn" disabled={!done} onClick={onNext}>
          {last ? questionFooterStrings.question.seeResult : questionFooterStrings.question.next}
        </button>
      </span>
    </div>
  );
}
