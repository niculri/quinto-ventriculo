import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The right column of the site (ui/AppShell.tsx): always there on wide screens, so that the page in the
 * middle has the same width everywhere and nothing moves going from one page to another. A note puts its
 * index in it; on the other pages it is empty.
 */
export const RailContext = createContext<HTMLElement | null>(null);

/** What a page shows in the right column (nothing while the column is not on screen). */
export function Rail({ children }: { children: ReactNode }) {
  const rail = useContext(RailContext);
  return rail ? createPortal(children, rail) : null;
}
