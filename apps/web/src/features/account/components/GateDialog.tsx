// A popup that is answered, not closed: always open and without a way to close it, so there is no ✕ and neither Escape
// nor a click outside closes it.
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LogoMark } from '../../../shared/ui/Logo';
import { BlurredBackdrop } from '../../../shared/ui/Dialog';

export function GateDialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <BlurredBackdrop />
        <Dialog.Content className="fixed top-[12vh] left-1/2 z-50 max-h-[80dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <LogoMark className="size-7 flex-none" />
            <Dialog.Title className="font-serif text-xl leading-tight font-semibold">
              {title}
            </Dialog.Title>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
