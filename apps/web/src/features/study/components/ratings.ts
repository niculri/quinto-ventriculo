// The answer buttons of the study screens: their rating, label and color, and how their row is drawn.
import type { Rating } from '@qv/srs';
import { button } from '../../../shared/ui/styles';
import { ratingsStrings } from './strings/ratings.strings';

export const RATINGS: { rating: Rating; label: string; className: string }[] = [
  {
    rating: 1,
    label: ratingsStrings.ratings.again,
    className: 'text-[#c62828] dark:text-[#ff8a80]',
  },
  { rating: 2, label: ratingsStrings.ratings.hard, className: 'text-muted' },
  {
    rating: 3,
    label: ratingsStrings.ratings.good,
    className: 'text-[#2e7d32] dark:text-[#85d08a]',
  },
  { rating: 4, label: ratingsStrings.ratings.easy, className: 'text-state-new' },
];

/**
 * The answers' row: as wide as «Mostrar respuesta» and its buttons joined by a border, so a second tap where «Mostrar
 * respuesta» was never falls in a gap between two of them.
 */
export const ANSWER_ROW = 'mx-auto grid max-w-2xl';

/** An answer button of that row: square inner corners, its left border over its neighbor's right one. */
export const ANSWER_BUTTON = `${button.base.replace('rounded-lg', '')} ${button.secondary} relative rounded-none first:rounded-l-lg last:rounded-r-lg not-first:-ml-px hover:z-10 focus-visible:z-10`;
