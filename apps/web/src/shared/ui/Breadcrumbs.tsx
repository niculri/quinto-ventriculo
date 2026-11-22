// The breadcrumbs above a page's title, and on their row the admin mode's tags of the page.
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { AdminReason } from '@qv/schema/http';
import { sharedStrings } from '../strings';
import { AdminTag } from './AdminTag';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * With `adminReasons` (only the admin mode has them) the tags go on the same row, to the right, and the route is cut
 * with «…» to make room, never wrapped: the title stays where it is with or without them. The page's own name is what
 * gives way first: the title right below says it.
 */
export function Breadcrumbs({
  items,
  adminReasons = [],
}: {
  items: Crumb[];
  adminReasons?: readonly AdminReason[];
}) {
  const tagged = adminReasons.length > 0;
  const route = (
    <nav
      aria-label={sharedStrings.breadcrumbs}
      className={tagged ? 'min-w-0 text-sm text-muted' : 'mb-4 text-sm text-muted'}
    >
      <ol className={`flex items-center gap-1 ${tagged ? '' : 'flex-wrap'}`}>
        {items.map((c, i) => (
          <li
            key={`${c.label}-${i}`}
            className={`flex items-center gap-1 ${tagged ? (i === 0 ? 'flex-none' : `min-w-0 ${i === items.length - 1 ? 'shrink-[10]' : ''}`) : ''}`}
          >
            {i > 0 ? (
              <ChevronRight className="size-3.5 flex-none opacity-60" aria-hidden="true" />
            ) : null}
            {c.to ? (
              // 24 px for a finger, only 2 px up and down: wrapped lines are 4 px apart, and a taller area would take
              // the taps meant for the line above.
              <Link
                to={c.to}
                className="relative min-w-0 rounded after:absolute after:-inset-x-1 after:-inset-y-0.5 hover:text-ink"
              >
                <span className={tagged ? 'block truncate' : undefined}>{c.label}</span>
              </Link>
            ) : (
              <span aria-current="page" className={`text-ink ${tagged ? 'truncate' : ''}`}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
  if (!tagged) return route;
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      {route}
      <AdminTag reasons={adminReasons} />
    </div>
  );
}
