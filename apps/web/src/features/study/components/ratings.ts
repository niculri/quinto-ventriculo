// The answer buttons of the study screens: their rating, label and color.
import type { Rating } from '@qv/srs';

export const RATINGS: { rating: Rating; label: string; className: string }[] = [
  { rating: 1, label: 'Otra vez', className: 'text-[#c62828] dark:text-[#ff8a80]' },
  { rating: 2, label: 'Difícil', className: 'text-muted' },
  { rating: 3, label: 'Bien', className: 'text-[#2e7d32] dark:text-[#85d08a]' },
  { rating: 4, label: 'Fácil', className: 'text-state-new' },
];
