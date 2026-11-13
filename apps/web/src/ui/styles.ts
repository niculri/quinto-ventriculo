/** Classes of the buttons and cards, so they are not repeated in every component. */
export const button = {
  base: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  // The main buttons answer to a finger 44 px high, without growing what is drawn.
  primary:
    'relative bg-brand px-4 py-2.5 text-white hover:bg-brand-2 dark:text-[#0a1316] shadow-sm after:absolute after:inset-x-0 after:-inset-y-1',
  secondary: 'border border-border bg-surface px-4 py-2.5 text-ink hover:bg-surface-2',
  ghost: 'px-2.5 py-2 text-muted hover:bg-surface-2 hover:text-ink',
  /** What cannot be undone easily (deleting the account). */
  danger:
    'border border-[#c2410c]/40 bg-surface px-4 py-2.5 text-[#c2410c] hover:bg-[#c2410c]/8 dark:text-[#f0875a]',
};

/**
 * A small target (a link of the breadcrumbs, a line of text that opens something) that answers to a finger beyond what
 * is drawn: 24 px at least (WCAG 2.5.8), and nothing moves.
 */
export const tapArea = 'relative after:absolute after:-inset-x-1 after:-inset-y-1.5';

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

/**
 * The screens where one answers (studying, the final review, practicing): the window under the site's bar, as Anki's
 * reviewer. On a phone the bar goes away (ui/AppShell.tsx) and the card takes its height; the answers stay above the
 * iPhone's home indicator.
 */
export const studyScreen =
  'mx-auto flex h-[calc(100dvh-4rem-1px)] max-w-5xl flex-col px-2 pt-2 pb-[env(safe-area-inset-bottom)] max-sm:h-dvh max-sm:pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 sm:pt-3';

/**
 * The top row of the screens where one answers (studying a deck, a final review): «Volver» on the left, what
 * is left in the middle of the screen whatever the length of the sides, the tools on the right. Three columns:
 * the two sides with the same width (at least `--bar-side`, room for the tools on the right), the middle as
 * wide as its text up to what is left (then cut).
 */
export const answerBar =
  'grid grid-cols-[minmax(var(--bar-side),1fr)_minmax(0,auto)_minmax(var(--bar-side),1fr)] items-center gap-2 [--bar-side:7.5rem] sm:[--bar-side:14rem]';
