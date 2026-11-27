// The breadcrumbs above a page's title, and on their row the admin mode's tags of the page.
import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { AdminReason } from '@qv/schema/http';
import { keyed } from '../lib/keyed';
import { breadcrumbsStrings } from './strings/Breadcrumbs.strings';
import { AdminTag } from './AdminTag';

export interface Crumb {
  label: string;
  to?: string;
}

function CrumbLabel({ crumb }: { crumb: Crumb }) {
  if (!crumb.to) {
    return (
      <span aria-current="page" className="truncate text-ink">
        {crumb.label}
      </span>
    );
  }
  // 44 px for a finger: the route is one line, with room above (the page's top) and below (the gap to the title).
  return (
    <Link
      to={crumb.to}
      className="relative min-w-0 rounded after:absolute after:-inset-x-1 after:-inset-y-3 hover:text-ink"
    >
      <span className="block truncate">{crumb.label}</span>
    </Link>
  );
}

/**
 * The route is always one line, so the title right below is at the same place on every page: it is cut with «…», never
 * wrapped. The page's own name is what gives way first (down to nothing, the others only keep half the row at most): the
 * title right below says it; when that is not enough, the others are cut too (each keeps its «›», 1.125rem). On a
 * phone, where a long route does not fit, its middle is a «…» (the menu has it whole).
 * With `adminReasons` (only the admin mode has them) the tags go on the same row, to the right.
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
  const collapsed = items.length > 3;
  const route = (
    <nav
      aria-label={breadcrumbsStrings.breadcrumbs}
      className={tagged ? 'min-w-0 text-sm text-muted' : 'mb-4 text-sm text-muted'}
    >
      <ol className="flex items-center gap-1">
        {keyed(items, (c) => c.label).map(({ key, item: c }, i) => (
          <Fragment key={key}>
            {collapsed && i === 1 ? (
              <li aria-hidden="true" className="flex flex-none items-center gap-1 sm:hidden">
                <ChevronRight className="size-3.5 flex-none opacity-60" />…
              </li>
            ) : null}
            <li
              className={`flex items-center gap-1 ${i === 0 ? 'flex-none' : `min-w-[1.125rem] ${i === last ? 'shrink-[10]' : 'max-w-[50%]'}`} ${collapsed && i > 0 && i < last - 1 ? 'max-sm:hidden' : ''}`}
            >
              {i > 0 ? (
                <ChevronRight className="size-3.5 flex-none opacity-60" aria-hidden="true" />
              ) : null}
              <CrumbLabel crumb={c} />
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
