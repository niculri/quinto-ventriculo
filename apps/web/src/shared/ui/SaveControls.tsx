// «Guardar» with its status («Sin guardar» / «Guardado»), at the top of an options page.
import { Check, CircleDot } from 'lucide-react';
import { saveControlsStrings as s } from './strings/SaveControls.strings';
import { button } from './styles';

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
            <CircleDot className="size-3.5" aria-hidden="true" /> {s.unsaved}
          </span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Check className="size-3.5" aria-hidden="true" /> {s.saved}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className={`${button.base} ${button.primary} disabled:opacity-50`}
      >
        {s.save}
      </button>
    </div>
  );
}
