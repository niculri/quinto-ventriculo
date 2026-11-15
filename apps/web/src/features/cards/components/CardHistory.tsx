// The history of a card in its information: each answer with its date, kind, button, interval, stability and time.

import type { UseQueryResult } from '@tanstack/react-query';
import { timeSpan } from '@qv/srs';
import type { CardLogEntry } from '../../progress/api/repository';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';

const RATING = ['Otra vez', 'Difícil', 'Bien', 'Fácil'];
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
  if (e.action === 'forget') return 'Manual';
  switch (e.phaseBefore) {
    case 'new':
    case 'learning':
      return 'Aprendizaje';
    case 'review':
      return 'Repaso';
    case 'relearning':
      return 'Reaprendizaje';
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
      <h4 className="mt-4 mb-1 font-semibold">Historial</h4>
      {log.isError ? (
        <ErrorWithRetry error={log.error} onRetry={() => void log.refetch()} />
      ) : !log.data ? (
        <Loading text="Cargando el historial…" />
      ) : answers.length === 0 ? (
        <p className="text-muted">Todavía no la has estudiado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Historial de repasos">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-2 font-medium">Fecha</th>
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 font-medium">Botón</th>
                <th className="py-1 pr-2 font-medium">Intervalo</th>
                <th className="py-1 pr-2 font-medium">Estabilidad</th>
                <th className="py-1 font-medium">Tiempo</th>
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
                    {e.rating ? RATING[e.rating - 1] : '—'}
                  </td>
                  <td className="py-1 pr-2">
                    {e.interval === null
                      ? '—'
                      : timeSpan(e.interval < 0 ? -e.interval : e.interval * 86_400)}
                  </td>
                  <td className="py-1 pr-2">
                    {e.stability === null ? '—' : timeSpan(e.stability * 86_400)}
                  </td>
                  <td className="py-1">
                    {e.durationMs === null ? '—' : timeSpan(e.durationMs / 1000)}
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
