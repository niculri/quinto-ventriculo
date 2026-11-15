// A question's alternatives in their order on screen: before answering, buttons; after, the right, the chosen and the
// rest dimmed.
import { LETTERS } from '@qv/quiz';
import type { QuizQuestion } from '@qv/schema';
import { quizStrings as s } from '../strings';
import { Html } from './Html';

type Choice = Extract<QuizQuestion, { kind: 'choice' }>;

const stateOf = (q: Choice, i: number, chosen: number | null | undefined, done: boolean) =>
  !done ? '' : i === q.correct ? 'buena' : i === chosen ? 'mala' : 'tenue';

export function Options({
  question,
  order,
  done,
  chosen,
  onAnswer,
}: {
  question: Choice;
  order: number[];
  done: boolean;
  chosen: number | null | undefined;
  onAnswer: (original: number) => void;
}) {
  return (
    <ul className="opts" aria-label={s.question.options}>
      {order.map((i, k) => {
        const state = stateOf(question, i, chosen, done);
        return (
          <li key={i}>
            <button
              type="button"
              className={`opt ${state}`}
              disabled={done}
              onClick={() => onAnswer(i)}
              aria-pressed={done ? i === chosen : undefined}
            >
              <span className="lt">{LETTERS[k]}</span>
              <Html className="otx" html={question.options[i]!} />
              {state === 'buena' ? (
                <span className="sr-only">
                  {i === chosen ? s.question.yoursRight : s.question.theRight}
                </span>
              ) : state === 'mala' ? (
                <span className="sr-only">{s.question.yoursWrong}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
