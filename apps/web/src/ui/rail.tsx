// The site's right column, always reserved on wide screens so that the page in the middle has the same width
// everywhere; a page puts something in it (a note, its index) with <Rail>.
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const RailContext = createContext<HTMLElement | null>(null);

export function Rail({ children }: { children: ReactNode }) {
  const rail = useContext(RailContext);
  return rail ? createPortal(children, rail) : null;
}
