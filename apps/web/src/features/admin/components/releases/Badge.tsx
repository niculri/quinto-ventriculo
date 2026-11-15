// A small round label: new, a warning, or neutral.
import type { ReactNode } from 'react';

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'warn' | 'new';
}) {
  const color =
    tone === 'warn'
      ? 'border-accent/40 text-accent'
      : tone === 'new'
        ? 'border-state-review/40 text-state-review'
        : 'border-border text-muted';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {children}
    </span>
  );
}
