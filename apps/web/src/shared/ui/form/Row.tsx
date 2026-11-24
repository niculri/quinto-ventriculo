// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// A row of an options form: the label (with its help) on the left, the control and its «restore» button on the right.
// It is `relative`, so that a switch with `wholeRow` covers it.
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { rowStrings } from './strings/Row.strings';

export function Row({
  label,
  id,
  help,
  children,
}: {
  label: string;
  id: string;
  help?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {help ? <p className="mt-0.5 text-xs text-muted">{help}</p> : null}
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

/** Restores the default value; an empty box of the same size when the value already is the default. */
export function Revert<T>({
  value,
  fallback,
  onChange,
}: {
  value: T;
  fallback: T;
  onChange: (v: T) => void;
}) {
  if (JSON.stringify(value) === JSON.stringify(fallback)) return <span className="size-7" />;
  return (
    <button
      type="button"
      onClick={() => onChange(fallback)}
      className="relative z-20 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
      title={rowStrings.restoreTitle}
      aria-label={rowStrings.restore}
    >
      <RotateCcw className="size-4" aria-hidden="true" />
    </button>
  );
}
