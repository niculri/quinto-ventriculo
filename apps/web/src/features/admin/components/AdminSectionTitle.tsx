// A section's title (the page's second level) and the tab's title while it is open.
import type { ReactNode } from 'react';
import { useTitle } from '../../../shared/hooks/useTitle';

export function AdminSectionTitle({ title, children }: { title: string; children?: ReactNode }) {
  useTitle(title);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      {children}
    </div>
  );
}
