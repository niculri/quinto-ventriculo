// The site's on/off switch; `label` is its name for screen readers (the text beside it, or the row it is in), and
// `mixed` draws it half on, for a group with some of its parts on (`describedBy` names the text that says how many).

/**
 * With `wholeRow` the switch's (invisible) input covers its row, the nearest ancestor with `relative isolate`: a click
 * anywhere on the row turns it, with the same focus and the same name. Another control on that row goes above it
 * (`relative z-20`). `isolate` keeps those layers inside the row, under a sticky bar the row scrolls beneath.
 */
export function Switch({
  id,
  label,
  checked,
  mixed = false,
  describedBy,
  disabled = false,
  wholeRow = false,
  onChange,
}: {
  id?: string;
  label: string;
  checked: boolean;
  mixed?: boolean;
  describedBy?: string | undefined;
  disabled?: boolean;
  wholeRow?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const half = mixed && !checked;
  return (
    <span
      className={`group/switch inline-flex h-6 w-10 flex-none items-center ${wholeRow ? '' : 'relative isolate'}`}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-describedby={describedBy}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-default"
      />
      <span aria-hidden="true" className="relative inline-flex h-6 w-10 items-center">
        <span
          className={`absolute inset-0 rounded-full transition-colors ${half ? 'bg-brand/50' : 'bg-border-strong'} group-has-checked/switch:bg-brand group-has-focus-visible/switch:ring-2 group-has-focus-visible/switch:ring-brand group-has-focus-visible/switch:ring-offset-2 group-has-focus-visible/switch:ring-offset-surface group-has-disabled/switch:opacity-50`}
        />
        <span
          className={`absolute left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform group-has-checked/switch:translate-x-4 ${half ? 'translate-x-2' : ''}`}
        />
      </span>
    </span>
  );
}

/** The look of a switch, for a row that is the control itself (a menu item): the row has the role and the state. */
export function SwitchTrack({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className="relative inline-flex h-6 w-10 flex-none items-center">
      <span
        className={`absolute inset-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-border-strong'}`}
      />
      <span
        className={`absolute left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`}
      />
    </span>
  );
}
