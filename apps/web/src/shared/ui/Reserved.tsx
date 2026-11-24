// Text that changes without moving what is below it: its place is as high as the longest of `longest` at any width,
// all in the same cell of a grid.
import type { ReactNode } from 'react';

export function Reserved({
  longest,
  className = '',
  children,
}: {
  longest: string | readonly string[];
  className?: string;
  children: ReactNode;
}) {
  const texts = typeof longest === 'string' ? [longest] : longest;
  return (
    <div className={`grid ${className}`}>
      {texts.map((text) => (
        <span key={text} aria-hidden="true" className="invisible col-start-1 row-start-1">
          {text}
        </span>
      ))}
      <div className="col-start-1 row-start-1 min-w-0">{children}</div>
    </div>
  );
}
