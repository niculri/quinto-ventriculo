// Text only for screen readers, in a row of the cards page's list.
import type { ReactNode } from 'react';

export function Said({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
