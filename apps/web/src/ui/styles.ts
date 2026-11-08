/** Classes of the buttons and cards, so they are not repeated in every component. */
export const button = {
  base: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  primary: 'bg-brand px-4 py-2.5 text-white hover:bg-brand-2 dark:text-[#0a1316] shadow-sm',
  secondary: 'border border-border bg-surface px-4 py-2.5 text-ink hover:bg-surface-2',
  ghost: 'px-2.5 py-2 text-muted hover:bg-surface-2 hover:text-ink',
  /** What cannot be undone easily (deleting the account). */
  danger:
    'border border-[#c2410c]/40 bg-surface px-4 py-2.5 text-[#c2410c] hover:bg-[#c2410c]/8 dark:text-[#f0875a]',
};

export const card = 'rounded-xl border border-border bg-surface shadow-soft';

export const linkCard = `${card} block transition hover:border-border-strong hover:-translate-y-px`;

/**
 * Every page's column (home, semester, course, note, test, deck, options…): the same width (an article's
 * reading width), centered between the site's menu and the right column, with the same padding (20px), so the
 * breadcrumbs and the title start at the same place on every page. The top as the menu's (pt-5).
 */
export const page = 'mx-auto w-full max-w-[55.5rem] px-4 pt-5 pb-10 sm:px-5';

/** A tool that needs every column (the browser of cards): all the width, the same padding. */
export const widePage = 'w-full px-4 pt-5 pb-10 sm:px-5';
