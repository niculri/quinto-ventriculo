// A link to the place reported: inside the site; an article's quote, in a new page (the browser highlights it there).
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';

export function PlaceAnchor({
  to,
  external,
  children,
}: {
  to: string;
  external: boolean;
  children: ReactNode;
}) {
  const cls = 'inline-flex items-center gap-1 text-ink hover:underline';
  return external ? (
    <a href={to} target="_blank" rel="noreferrer" className={cls}>
      {children}
      <ExternalLink className="size-3.5 text-muted" aria-hidden="true" />
    </a>
  ) : (
    <Link to={to} className={cls}>
      {children}
    </Link>
  );
}
