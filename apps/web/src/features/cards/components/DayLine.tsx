// The line of a heatmap day on the cards page: what was answered or is due that day, or why it cannot say.
import { CalendarDays, X } from 'lucide-react';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { dateText } from '@qv/study';
import type { DayCards } from '../model/dayCards';

export function DayLine({
  day,
  value,
  onClear,
  failed,
  onRetry,
}: {
  day: number | null;
  value: DayCards | null;
  onClear: () => void;
  failed: boolean;
  onRetry: () => void;
}) {
  const cards = (n: number) => `${n.toLocaleString('es-CL')} ${n === 1 ? 'tarjeta' : 'tarjetas'}`;
  let text = '';
  if (day === null) text = 'Ese día no existe.';
  else if (failed) text = 'No se pudieron leer las tarjetas de ese día.';
  else if (value) {
    const date = dateText(day, true);
    const answers = (n: number) =>
      `${n.toLocaleString('es-CL')} ${n === 1 ? 'respuesta' : 'respuestas'}`;
    const practice = `${answers(value.practice)} de práctica, que no se guardan por tarjeta`;
    if (value.kind === 'due') text = `${date}: ${cards(value.keys.size)} por repasar.`;
    else if (!value.practice) {
      text = `${date}: respondiste ${cards(value.keys.size)} (${answers(value.answers)}).`;
    } else if (!value.answers) text = `${date}: ${practice}.`;
    else {
      text = `${date}: respondiste ${cards(value.keys.size)} (${answers(value.answers)}) y ${practice}.`;
    }
  }
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <CalendarDays className="mt-0.5 size-4 flex-none text-muted" aria-hidden="true" />
      <Reserved
        longest="Miércoles 30 de septiembre de 2026: respondiste 1.000 tarjetas (10.000 respuestas) y 5.000 respuestas de práctica, que no se guardan por tarjeta."
        className="min-w-0 flex-1"
      >
        <div role="status" className="first-letter:uppercase">
          {text || <Skeleton className="h-4 w-64" />}
          {failed ? (
            <button type="button" onClick={onRetry} className="ml-2 underline">
              Reintentar
            </button>
          ) : null}
        </div>
      </Reserved>
      <button
        type="button"
        onClick={onClear}
        className="-my-1 flex-none rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
        aria-label="Ver todos los días"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
