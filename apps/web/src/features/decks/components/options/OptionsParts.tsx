// The pieces of the Anki options pages: a section, a warning, «Guardar» with its status and why a save failed.
import type { ReactNode } from 'react';
import { Check, CircleDot } from 'lucide-react';
import { button, card } from '../../../../shared/ui/styles';
import { optionsStrings as o } from '../../options.strings';

export function SaveControls({
  dirty,
  saved,
  saving,
  onSave,
}: {
  dirty: boolean;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span role="status" className="inline-flex w-24 justify-end text-xs font-medium">
        {dirty ? (
          <span className="inline-flex items-center gap-1 text-state-learn">
            <CircleDot className="size-3.5" aria-hidden="true" /> {o.unsaved}
          </span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Check className="size-3.5" aria-hidden="true" /> {o.saved}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className={`${button.base} ${button.primary} disabled:opacity-50`}
      >
        {o.save}
      </button>
    </div>
  );
}

export function SaveFailure({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-3 text-sm text-state-learn">
      {o.saveFailed(error)}
    </p>
  ) : null;
}

export function OptionsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${card} mt-6 px-4 py-2 sm:px-6`} aria-label={title}>
      <h2 className="border-b border-border py-3 text-lg font-semibold">{title}</h2>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="py-2 text-sm text-[#b45309] dark:text-[#f2b67a]">
      {children}
    </p>
  );
}
