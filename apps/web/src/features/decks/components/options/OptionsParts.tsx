// The pieces of the Anki options pages: a section, a warning and why a save failed.
import type { ReactNode } from 'react';
import { card } from '../../../../shared/ui/styles';
import { optionsPartsStrings as o } from './strings/OptionsParts.strings';

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
