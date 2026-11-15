// A short-answer question: «Mostrar respuesta», then the answer and, until answered, whether one knew it.
import { quizStrings as s } from '../strings';
import { Html } from './Html';

export function RevealButton({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="abierta">
      <button type="button" className="btn2" onClick={onReveal}>
        {s.question.reveal}
      </button>
    </div>
  );
}

export function ShortAnswer({
  answer,
  done,
  onSelfAssess,
}: {
  answer: string;
  done: boolean;
  onSelfAssess: (knewIt: boolean) => void;
}) {
  return (
    <div>
      <div className="resp">
        <div className="rl">{s.question.answer}</div>
        <Html html={answer} />
      </div>
      {!done ? (
        <div className="autoev">
          <button type="button" className="bsi" onClick={() => onSelfAssess(true)}>
            {s.question.knewIt}
          </button>
          <button type="button" className="bno" onClick={() => onSelfAssess(false)}>
            {s.question.didNot}
          </button>
        </div>
      ) : null}
    </div>
  );
}
