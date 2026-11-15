// The rows of the site's menu: a link, a branch that opens, the nested list, and their classes.
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export const row =
  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors';
const idle = 'text-muted hover:bg-surface-2 hover:text-ink';
const current = 'bg-brand-soft font-medium text-ink';
const onPath = 'font-medium text-ink hover:bg-surface-2';

export function NavLink({
  to,
  active,
  inPath = false,
  icon,
  children,
  onNavigate,
}: {
  to: string;
  active: boolean;
  inPath?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`${row} ${active ? current : inPath ? onPath : idle}`}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}

export function Branch({
  label,
  icon,
  open,
  onToggle,
  inPath,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  inPath: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`${row} ${inPath ? onPath : idle}`}
      >
        {icon}
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronRight
          className={`size-3.5 flex-none text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? <Nested>{children}</Nested> : null}
    </li>
  );
}

export function Nested({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-0.5 mb-1 ml-[1.1rem] space-y-0.5 border-l border-border pl-1.5">
      {children}
    </ul>
  );
}

export const icon = 'size-4 flex-none';
