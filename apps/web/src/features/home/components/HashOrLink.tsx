// A link that is a plain anchor for a place on this page (`#…`) and a router link for any other page.

import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function HashOrLink({
  to,
  className,
  children,
}: {
  to: string;
  className: string;
  children: ReactNode;
}) {
  return to.startsWith('#') ? (
    <a href={to} className={className}>
      {children}
    </a>
  ) : (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}
