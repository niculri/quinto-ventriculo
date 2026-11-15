// A card of what is inside the site or is coming, with its icon and a mark saying which.
import type { ReactNode } from 'react';
import { landingStrings as s } from '../strings';

export function Feature({
  Icon,
  title,
  children,
  soon = false,
}: {
  Icon: (p: { className?: string }) => ReactNode;
  title: string;
  children: ReactNode;
  soon?: boolean;
}) {
  return (
    <li
      className={`flex flex-col rounded-xl border p-5 ${
        soon ? 'border-dashed border-border-strong bg-bg/60' : 'border-border bg-bg shadow-xs'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex size-10 items-center justify-center rounded-lg ${
            soon ? 'bg-surface-2 text-muted' : 'bg-brand-soft text-brand'
          }`}
        >
          <Icon className="size-5" />
        </span>
        {soon ? (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-[#9a4a12] dark:text-accent">
            {s.soon}
          </span>
        ) : (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
            {s.available}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </li>
  );
}
