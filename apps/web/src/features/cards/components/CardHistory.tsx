// The history of a card in its information: each answer with its date, kind, button, interval, stability and time.

import type { UseQueryResult } from '@tanstack/react-query';
import { timeSpan } from '@qv/srs';
import type { CardLogEntry } from '../../progress/api/repository';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { cardsStrings } from '../strings';

const RATING = cardsStrings.info.ratings;
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
  if (e.action === 'forget') return cardsStrings.info.kinds.manual;
  switch (e.phaseBefore) {
    case 'new':
    case 'learning':
      return cardsStrings.info.kinds.learning;
    case 'review':
      return cardsStrings.info.kinds.review;
    case 'relearning':
      return cardsStrings.info.kinds.relearning;
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
      <h4 className="mt-4 mb-1 font-semibold">{cardsStrings.info.history}</h4>
      {log.isError ? (
        <ErrorWithRetry error={log.error} onRetry={() => void log.refetch()} />
      ) : !log.data ? (
        <Loading text={cardsStrings.info.loadingHistory} />
      ) : answers.length === 0 ? (
        <p className="text-muted">{cardsStrings.info.notStudied}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label={cardsStrings.info.historyTable}>
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-2 font-medium">{cardsStrings.info.columns.date}</th>
                <th className="py-1 pr-2 font-medium">{cardsStrings.info.columns.kind}</th>
                <th className="py-1 pr-2 font-medium">{cardsStrings.info.columns.button}</th>
                <th className="py-1 pr-2 font-medium">{cardsStrings.info.columns.interval}</th>
                <th className="py-1 pr-2 font-medium">{cardsStrings.info.columns.stability}</th>
                <th className="py-1 font-medium">{cardsStrings.info.columns.time}</th>
              </tr>
            </thead>
            <tbody>
              {[...answers].reverse().map((e, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {DATE_TIME.format(new Date(e.reviewedAt))}
                  </td>
                  <td className="py-1 pr-2">{kindOf(e)}</td>
                  <td
                    className={`py-1 pr-2 font-medium ${e.rating ? RATING_COLORS[e.rating - 1] : ''}`}
                  >
                    {e.rating ? RATING[e.rating - 1] : cardsStrings.info.none}
                  </td>
                  <td className="py-1 pr-2">
                    {e.interval === null
                      ? cardsStrings.info.none
                      : timeSpan(e.interval < 0 ? -e.interval : e.interval * 86_400)}
                  </td>
                  <td className="py-1 pr-2">
                    {e.stability === null ? cardsStrings.info.none : timeSpan(e.stability * 86_400)}
                  </td>
                  <td className="py-1">
                    {e.durationMs === null ? cardsStrings.info.none : timeSpan(e.durationMs / 1000)}
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
