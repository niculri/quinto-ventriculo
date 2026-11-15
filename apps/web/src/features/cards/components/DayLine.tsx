// The line of a heatmap day on the cards page: what was answered or is due that day, or why it cannot say.
import { CalendarDays, X } from 'lucide-react';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { dateText } from '@qv/study';
import type { DayCards } from '../model/dayCards';
import { sharedStrings } from '../../../shared/strings';
import { cardsStrings } from '../strings';

function lineText(day: number | null, failed: boolean, value: DayCards | null): string {
  if (day === null) return cardsStrings.day.missing;
  if (failed) return cardsStrings.day.failed;
  if (!value) return '';
  const date = dateText(day, true);
  const cards = cardsStrings.cards(value.keys.size);
  const answers = cardsStrings.day.answers(value.answers);
  const practice = cardsStrings.day.practice(cardsStrings.day.answers(value.practice));
  if (value.kind === 'due') return cardsStrings.day.due(date, cards);
  if (!value.practice) return cardsStrings.day.answered(date, cards, answers);
  if (!value.answers) return cardsStrings.day.practiced(date, practice);
  return cardsStrings.day.both(date, cards, answers, practice);
}

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
  const text = lineText(day, failed, value);
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <CalendarDays className="mt-0.5 size-4 flex-none text-muted" aria-hidden="true" />
      <Reserved longest={cardsStrings.day.longest} className="min-w-0 flex-1">
        <div role="status" className="first-letter:uppercase">
          {text || <Skeleton className="h-4 w-64" />}
          {failed ? (
            <button type="button" onClick={onRetry} className="ml-2 underline">
              {sharedStrings.loadError.retry}
            </button>
          ) : null}
        </div>
      </Reserved>
      <button
        type="button"
        onClick={onClear}
        className="-my-1 flex-none rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
        aria-label={cardsStrings.day.allDays}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
