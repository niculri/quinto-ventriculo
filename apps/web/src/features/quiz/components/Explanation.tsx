// The explanations of an answered question: why each alternative (the right and the chosen marked) and the key idea.
import { LETTERS } from '@qv/quiz';
import type { QuizQuestion } from '@qv/schema';
import { explanationStrings as s } from './strings/Explanation.strings';
import { Html } from './Html';

export function Explanation({
  question,
  order,
  chosen,
}: {
  question: QuizQuestion;
  order: number[];
  chosen: number | null;
}) {
  const perOption = question.kind === 'choice' ? question.optionExplanations : undefined;
  return (
    <>
      {question.kind === 'choice' && perOption ? (
        <div className="exp">
          <div className="rl">{s.question.whyEach}</div>
          <ol className="xalt">
            {order.map((i, k) => (
              <li
                key={i}
                className={i === question.correct ? 'xa-ok' : i === chosen ? 'xa-mal' : undefined}
              >
                <span className="xl">{LETTERS[k]}</span>
                {i === question.correct ? (
                  <span className="sr-only">{s.question.theRightNote}</span>
                ) : null}
                <Html className="xt" html={perOption[i]!} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {question.explanation ? (
        <div className="exp">
          <div className="rl">{perOption ? s.question.keyIdea : s.question.explanation}</div>
          <Html html={question.explanation} />
        </div>
      ) : null}
    </>
  );
}
