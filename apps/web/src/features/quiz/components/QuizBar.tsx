// The bar over a question: back to the cover, where the round goes, its score, «Reiniciar», «Terminar» and the progress.
import type { Ref } from 'react';
import { progress, score } from '@qv/quiz';
import type { Round } from '@qv/quiz';
import { BackButton } from '../../../shared/ui/BackButton';
import { quizStrings as s } from '../strings';

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2.2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
} as const;

function Counts({
  round,
  restartRef,
  onRestart,
  onFinish,
}: {
  round: Round;
  restartRef: Ref<HTMLButtonElement>;
  onRestart: () => void;
  onFinish: () => void;
}) {
  const result = score(round);
  return (
    <>
      <span className="cont" aria-label={s.bar.position}>
        {round.index + 1} / {round.queue.length}
      </span>
      <span className="marca" aria-label={s.bar.score(result.correct, result.wrong)}>
        <span className="vb">
          ✓&nbsp;<b>{result.correct}</b>
        </span>
        <span className="vm">
          ✗&nbsp;<b>{result.wrong}</b>
        </span>
      </span>
      <span className="hacc">
        <button
          ref={restartRef}
          type="button"
          className="hbtn"
          title={s.bar.restart}
          aria-label={s.bar.restart}
          onClick={onRestart}
        >
          <svg {...ICON}>
            <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8.3" />
            <path d="M3 3v5.3h5.3" />
          </svg>
          <span>{s.bar.restartShort}</span>
        </button>
        <button
          type="button"
          className="hbtn"
          title={s.bar.finishHint}
          aria-label={s.bar.finish}
          onClick={onFinish}
        >
          <svg {...ICON}>
            <path d="M5 21V4" />
            <path d="M5 4h11l-2 4 2 4H5" />
          </svg>
          <span>{s.bar.finishShort}</span>
        </button>
      </span>
    </>
  );
}

export function QuizBar({
  round,
  backLabel,
  restartRef,
  onBack,
  onRestart,
  onFinish,
}: {
  round: Round | null;
  backLabel: string;
  restartRef: Ref<HTMLButtonElement>;
  onBack: () => void;
  onRestart: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="qz-bar">
      <div className="wrap hrow">
        <BackButton className="qz-back" label={backLabel} onClick={onBack} />
        <span className="hgrow" />
        {round ? (
          <Counts round={round} restartRef={restartRef} onRestart={onRestart} onFinish={onFinish} />
        ) : null}
      </div>
      <div className="wrap">
        <div className="pb">
          <i style={{ width: `${round ? progress(round) * 100 : 0}%` }} />
        </div>
      </div>
    </div>
  );
}
