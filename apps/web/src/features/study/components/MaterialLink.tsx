// A link to a card's material (its article or its test), in a new tab.
import type { ReactNode } from 'react';

// Focus does not stay on the link: back here, Enter has to answer, not open it again.
export function MaterialLink({
  href,
  className = 'inline-flex items-center gap-1 hover:text-ink hover:underline',
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.currentTarget.blur()}
      className={className}
    >
      {children}
    </a>
  );
}
