// The pieces of the cards page's filters: a titled section, a radio option over its whole row, and an option's count.

import type { ReactNode } from 'react';
import type { Facets } from '../model/explorer';

export function count(facets: Facets | null, n: number | undefined, width = 'w-12') {
  return (
    <span className={`ml-auto ${width} flex-none text-right text-xs text-muted tabular-nums`}>
      {facets && n !== undefined ? n.toLocaleString('es-CL') : ''}
    </span>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function Choice({
  name,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`relative flex items-center gap-2 rounded-md px-2 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
        checked
          ? 'bg-brand-soft font-medium text-brand'
          : disabled
            ? 'opacity-50'
            : 'hover:bg-surface-2'
      } ${disabled ? '' : 'cursor-pointer'}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        // Over the whole row, invisible: a click anywhere on it chooses it.
        className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-default"
      />
      {children}
    </label>
  );
}
