// The site's on/off switch; `label` is its name for screen readers (the text beside it, or the row it is in).

/**
 * With `wholeRow` the switch's (invisible) input covers its row, the nearest ancestor with `relative`: a click anywhere
 * on the row turns it, with the same focus and the same name. Another control on that row goes above it (`z-20`).
 */
export function Switch({
  id,
  label,
  checked,
  disabled = false,
  wholeRow = false,
  onChange,
}: {
  id?: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  wholeRow?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span
      className={`group/switch inline-flex h-6 w-10 flex-none items-center ${wholeRow ? '' : 'relative'}`}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-default"
      />
      <span aria-hidden="true" className="relative inline-flex h-6 w-10 items-center">
        <span className="absolute inset-0 rounded-full bg-border-strong transition-colors group-has-checked/switch:bg-brand group-has-focus-visible/switch:ring-2 group-has-focus-visible/switch:ring-brand group-has-focus-visible/switch:ring-offset-2 group-has-focus-visible/switch:ring-offset-surface group-has-disabled/switch:opacity-50" />
        <span className="absolute left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform group-has-checked/switch:translate-x-4" />
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
