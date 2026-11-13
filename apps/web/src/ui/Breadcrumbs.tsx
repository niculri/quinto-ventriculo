import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Ruta" className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5 opacity-60" aria-hidden="true" /> : null}
            {c.to ? (
              // 24 px for a finger, only 2 px up and down: wrapped lines are 4 px apart, and a taller area would take
              // the taps meant for the line above.
              <Link
                to={c.to}
                className="relative rounded after:absolute after:-inset-x-1 after:-inset-y-0.5 hover:text-ink"
              >
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
