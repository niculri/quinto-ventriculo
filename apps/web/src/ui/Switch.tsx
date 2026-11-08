/** An on/off switch. `label` is its name for screen readers (the text beside it, or the row it is in). */
export function Switch({
  id,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  id?: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative inline-flex h-6 w-10 flex-none items-center">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-default"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-border-strong transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-disabled:opacity-50"
      />
      <span
        aria-hidden="true"
        className="absolute left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"
      />
    </span>
  );
}
