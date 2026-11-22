// The breadcrumbs above a page's title, and on their row the admin mode's tags of the page.
import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { AdminReason } from '@qv/schema/http';
import { breadcrumbsStrings } from './strings/Breadcrumbs.strings';
import { AdminTag } from './AdminTag';

export interface Crumb {
  label: string;
  to?: string;
}

function CrumbLabel({ crumb, tagged }: { crumb: Crumb; tagged: boolean }) {
  if (!crumb.to) {
    return (
      <span aria-current="page" className={`text-ink ${tagged ? 'truncate' : ''}`}>
        {crumb.label}
      </span>
    );
  }
  // 24 px for a finger, only 2 px up and down: wrapped lines are 4 px apart, and a taller area would take the taps
  // meant for the line above.
  return (
    <Link
      to={crumb.to}
      className="relative min-w-0 rounded after:absolute after:-inset-x-1 after:-inset-y-0.5 hover:text-ink"
    >
      <span className={tagged ? 'block truncate' : undefined}>{crumb.label}</span>
    </Link>
  );
}

/**
 * With `adminReasons` (only the admin mode has them) the tags go on the same row, to the right, and the route is cut
 * with «…» to make room, never wrapped: the title stays where it is with or without them. The page's own name is what
 * gives way first (down to nothing, the others only keep half the row at most): the title right below says it. On a phone, where there is no room for the whole route and a tag,
 * the middle of the route is a «…» (the menu has it whole) and what stays is read.
 */
export function Breadcrumbs({
  items,
  adminReasons = [],
}: {
  items: Crumb[];
  adminReasons?: readonly AdminReason[];
}) {
  const tagged = adminReasons.length > 0;
  const last = items.length - 1;
  const collapsed = tagged && items.length > 3;
  const route = (
    <nav
      aria-label={breadcrumbsStrings.breadcrumbs}
      className={tagged ? 'min-w-0 text-sm text-muted' : 'mb-4 text-sm text-muted'}
    >
      <ol className={`flex items-center gap-1 ${tagged ? '' : 'flex-wrap'}`}>
        {items.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {collapsed && i === 1 ? (
              <li aria-hidden="true" className="flex flex-none items-center gap-1 sm:hidden">
                <ChevronRight className="size-3.5 flex-none opacity-60" />…
              </li>
            ) : null}
            <li
              className={`flex items-center gap-1 ${tagged ? (i === 0 ? 'flex-none' : `min-w-0 ${i === last ? 'shrink-[10]' : 'max-w-[50%] shrink-0'}`) : ''} ${collapsed && i > 0 && i < last - 1 ? 'max-sm:hidden' : ''}`}
            >
              {i > 0 ? (
                <ChevronRight className="size-3.5 flex-none opacity-60" aria-hidden="true" />
              ) : null}
              <CrumbLabel crumb={c} tagged={tagged} />
            </li>
          </Fragment>
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
