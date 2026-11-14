// Text that changes without moving what is below it: its place is as high as `longest` at any width, both in the same
// cell of a grid.
import type { ReactNode } from 'react';

export function Reserved({
  longest,
  className = '',
  children,
}: {
  longest: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid ${className}`}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {longest}
      </span>
      <div className="col-start-1 row-start-1 min-w-0">{children}</div>
    </div>
  );
}
