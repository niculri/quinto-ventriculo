// The answer buttons of the study screens: their rating, label and color.
import type { Rating } from '@qv/srs';
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
