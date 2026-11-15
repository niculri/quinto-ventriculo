// Text only for screen readers, in a row of the cards page's list.
import type { ReactNode } from 'react';

export function SrOnly({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
