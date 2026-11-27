// A card of a course's page: its section's name, what it has, a drawing behind, and an optional footer.
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { linkCard } from '../../../shared/ui/styles';

/** Bigger than the corner it sits in, so the card cuts it; faint enough never to lower the contrast of the text. */
export const ART =
  'pointer-events-none absolute -right-5 -bottom-7 size-28 text-brand sm:-right-6 sm:-bottom-8 sm:size-36 opacity-[0.16] transition-opacity group-hover:opacity-25 dark:opacity-[0.22] dark:group-hover:opacity-30';

export function SectionCard({
  to,
  title,
  art,
  footer,
  children,
}: {
  to: string;
  title: string;
  art: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`${linkCard} group relative flex min-h-36 flex-col sm:min-h-44 overflow-hidden p-5`}
    >
      {art}
      <div className="relative flex items-start justify-between gap-2">
        <h3 className="font-serif text-2xl font-semibold tracking-tight">{title}</h3>
        <ArrowRight
          className="mt-2 size-4 flex-none text-muted transition group-hover:translate-x-0.5 group-hover:text-ink"
          aria-hidden="true"
        />
      </div>
      <p className="relative mt-1.5 text-sm text-muted">{children}</p>
      {footer ? <div className="relative mt-auto pt-4">{footer}</div> : null}
    </Link>
  );
}
