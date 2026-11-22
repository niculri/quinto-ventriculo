// One wrong answer in the results: the question, the answer given and the right one with their reasons, and
// «Reportar error».
import { MessageSquareWarning } from 'lucide-react';
import type { QuestionEntry } from '../model/entries';
import { quizStrings as s } from '../strings';
import { Html } from './Html';
import { TextWithStatements } from './TextWithStatements';

export function WrongAnswer({
  entry: e,
  chosen,
  onReport,
}: {
  entry: QuestionEntry;
  chosen: number | null;
  onReport: ((entry: QuestionEntry) => void) | undefined;
}) {
  const q = e.question;
  const why = (i: number) =>
    q.kind === 'choice' && q.optionExplanations?.[i] ? (
      <Html className="fexp" html={q.optionExplanations[i]} />
    ) : null;
  return (
    <div className="fallo">
      <div className="fl">
        <span>
          <Html html={e.group.name} />
          {s.results.question}
          {e.number}
        </span>
        {onReport ? (
          <button type="button" className="qz-report" onClick={() => onReport(e)}>
            <MessageSquareWarning className="size-4" aria-hidden="true" />
            {` ${s.question.report}`}
          </button>
        ) : null}
      </div>
      <div className="fq">
        {q.context ? <TextWithStatements as="p" className="fctx" html={q.context} /> : null}
        <TextWithStatements as="div" className="fpr" html={q.prompt} />
      </div>
      <dl>
        {q.kind === 'choice' ? (
          <>
            <dt>{s.results.yours}</dt>
            <dd className="cm">
              <Html html={q.options[chosen ?? 0]!} />
              {why(chosen ?? 0)}
            </dd>
            <dt>{s.results.correct}</dt>
            <dd className="cb">
              <Html html={q.options[q.correct]!} />
              {why(q.correct)}
            </dd>
          </>
        ) : (
          <>
            <dt>{s.results.answer}</dt>
            <Html as="dd" className="cb" html={q.answer} />
          </>
        )}
      </dl>
      {q.explanation ? (
        <div className="fx">
          <Html html={q.explanation} />
        </div>
      ) : null}
    </div>
  );
}
