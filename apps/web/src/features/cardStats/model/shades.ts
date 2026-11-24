// The colors of the statistics: the site's turquoise from light (learning) to full (mature); new and hidden cards and
// what is still to come, in grey (decision of the heatmap).

export const STATE_COLORS = {
  new: 'var(--surface-2)',
  learning: 'color-mix(in oklab, var(--heat) 35%, var(--brand-soft))',
  young: 'color-mix(in oklab, var(--heat) 65%, var(--brand-soft))',
  mature: 'var(--heat)',
  hidden: 'color-mix(in oklab, var(--muted) 45%, var(--surface-2))',
} as const;

export const PAST_BAR = 'var(--heat)';
export const DUE_BAR = 'color-mix(in oklab, var(--muted) 55%, var(--surface-2))';
