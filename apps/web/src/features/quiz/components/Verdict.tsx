// A question's verdict, a live region that is always there (one that appears with its text is not always read), and
// «Reportar error» beside it.
import { MessageSquareWarning } from 'lucide-react';
import type { Verdict as VerdictInfo } from '../model/verdict';
import { quizStrings as s } from '../strings';

export function Verdict({
  verdict,
  onReport,
}: {
  verdict: VerdictInfo | null;
  onReport: (() => void) | undefined;
}) {
  return (
    <div className={verdict ? 'vfila' : undefined}>
      <div
        role="status"
        className={verdict ? `veredicto ${verdict.good ? 'bien' : 'mal'}` : undefined}
      >
        {verdict ? (
          <>
            <span className="vi" aria-hidden="true">
              {verdict.good ? '✓' : '✗'}
            </span>
            <span>{verdict.text}</span>
          </>
        ) : null}
      </div>
      {verdict && onReport ? (
        <button type="button" className="qz-report" onClick={onReport}>
          <MessageSquareWarning className="size-4" aria-hidden="true" />
          {` ${s.question.report}`}
        </button>
      ) : null}
    </div>
  );
}
