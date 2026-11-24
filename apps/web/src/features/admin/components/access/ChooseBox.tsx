// A box to choose people to move; «some» shows the dash of a list where only some are chosen.
export function ChooseBox({
  label,
  state,
  onChange,
  disabled = false,
}: {
  label: string;
  state: 'all' | 'some' | 'none';
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={state === 'all'}
      ref={(el) => {
        if (el) el.indeterminate = state === 'some';
      }}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="size-5 flex-none cursor-pointer rounded accent-brand disabled:cursor-default sm:size-4"
    />
  );
}
