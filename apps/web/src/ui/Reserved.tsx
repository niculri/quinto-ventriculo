import type { ReactNode } from 'react';

/**
 * Text that changes without moving what is below it: the place is as high as `longest` at any width, whatever it says
 * now. Both go in the same cell of a grid.
 */
export function Reserved({
  longest,
  className = '',
  children,
}: {
  /** The longest thing it can say, with long numbers. */
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
