// A button of the table's toolbar: its icon, its name (only the icon on a phone) and its shortcut.
import { button } from '../../../shared/ui/styles';
import { keys } from '../../../shared/ui/keys';

import type { ReactNode } from 'react';

export function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  shortcut,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-keyshortcuts={shortcut ? keys(shortcut) : undefined}
      className={`${button.base} ${button.secondary} px-3 py-1.5`}
    >
      {icon}
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}
