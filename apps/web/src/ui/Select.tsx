import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A dropdown with the site's look, instead of the one each browser draws. `modal`: inside a dialog (its focus stays
 * in it); elsewhere it does not lock the page's scroll, which would move everything.
 */
export function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  modal = false,
  className = '',
}: {
  id?: string;
  /** What it chooses: for screen readers, with what is chosen. */
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  modal?: boolean;
  className?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <Menu.Root modal={modal}>
      <Menu.Trigger
        id={id}
        disabled={disabled}
        aria-label={`${label}: ${current}`}
        className={`group flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-ink transition-colors outline-none hover:border-border-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-default disabled:opacity-60 data-[state=open]:border-brand ${className}`}
      >
        <span className="min-w-0 truncate">{current}</span>
        <ChevronDown
          className="size-4 flex-none text-muted transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-[60] max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] max-w-[calc(100vw-1rem)] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-soft"
        >
          <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {options.map((o) => (
              <Menu.RadioItem
                key={o.value}
                value={o.value}
                className="relative cursor-pointer rounded-md py-2 pr-8 pl-2.5 text-sm text-ink outline-none data-[highlighted]:bg-surface-2 data-[state=checked]:font-medium"
              >
                {o.label}
                <Menu.ItemIndicator className="absolute top-1/2 right-2 -translate-y-1/2 text-brand">
                  <Check className="size-4" aria-hidden="true" />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
