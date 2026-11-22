// The history of a card in its information: each answer with its date, kind, button, interval, stability and time.

import type { UseQueryResult } from '@tanstack/react-query';
import { timeSpan } from '@qv/srs';
import type { CardLogEntry } from '../../progress/api/repository';
import { keyed } from '../../../shared/lib/keyed';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { cardHistoryStrings } from './strings/CardHistory.strings';
import { cardPreviewStrings } from './strings/CardPreview.strings';

const RATING_COLORS = [
  'text-[#c62828] dark:text-[#ff8a80]',
  'text-muted',
  'text-[#2e7d32] dark:text-[#85d08a]',
  'text-state-new',
];
const DATE_TIME = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Anki's revlog type of an answer: by the card's phase when it was answered. */
function kindOf(e: CardLogEntry): string {
  if (e.action === 'forget') return cardHistoryStrings.info.kinds.manual;
  switch (e.phaseBefore) {
    case 'new':
    case 'learning':
      return cardHistoryStrings.info.kinds.learning;
    case 'review':
      return cardHistoryStrings.info.kinds.review;
    case 'relearning':
      return cardHistoryStrings.info.kinds.relearning;
  }
}

export function CardHistory({
  log,
  answers,
}: {
  log: UseQueryResult<CardLogEntry[]>;
  answers: CardLogEntry[];
}) {
  return (
    <>
      <h4 className="mt-4 mb-1 font-semibold">{cardHistoryStrings.info.history}</h4>
      {log.isError ? (
        <ErrorWithRetry error={log.error} onRetry={() => void log.refetch()} />
      ) : !log.data ? (
        <Loading text={cardHistoryStrings.info.loadingHistory} />
      ) : answers.length === 0 ? (
        <p className="text-muted">{cardHistoryStrings.info.notStudied}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label={cardHistoryStrings.info.historyTable}>
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-2 font-medium">{cardHistoryStrings.info.columns.date}</th>
                <th className="py-1 pr-2 font-medium">{cardHistoryStrings.info.columns.kind}</th>
                <th className="py-1 pr-2 font-medium">{cardHistoryStrings.info.columns.button}</th>
                <th className="py-1 pr-2 font-medium">
                  {cardHistoryStrings.info.columns.interval}
                </th>
                <th className="py-1 pr-2 font-medium">
                  {cardHistoryStrings.info.columns.stability}
                </th>
                <th className="py-1 font-medium">{cardHistoryStrings.info.columns.time}</th>
              </tr>
            </thead>
            <tbody>
              {keyed([...answers].reverse(), (e) => e.reviewedAt).map(({ key, item: e }) => (
                <tr key={key} className="border-t border-border">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {DATE_TIME.format(new Date(e.reviewedAt))}
                  </td>
                  <td className="py-1 pr-2">{kindOf(e)}</td>
                  <td
                    className={`py-1 pr-2 font-medium ${e.rating ? (RATING_COLORS[e.rating - 1] ?? '') : ''}`}
                  >
                    {e.rating
                      ? cardHistoryStrings.info.ratings[e.rating - 1]
                      : cardPreviewStrings.info.none}
                  </td>
                  <td className="py-1 pr-2">
                    {e.interval === null
                      ? cardPreviewStrings.info.none
                      : timeSpan(e.interval < 0 ? -e.interval : e.interval * 86_400)}
                  </td>
                  <td className="py-1 pr-2">
                    {e.stability === null
                      ? cardPreviewStrings.info.none
                      : timeSpan(e.stability * 86_400)}
                  </td>
                  <td className="py-1">
                    {e.durationMs === null
                      ? cardPreviewStrings.info.none
                      : timeSpan(e.durationMs / 1000)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
