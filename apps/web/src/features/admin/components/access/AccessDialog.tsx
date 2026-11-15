// The popup of «Acceso» (it does not close while it works) and a list of emails with its title and count.
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { DimBackdrop } from '../../../../shared/ui/Dialog';
import { button } from '../../../../shared/ui/styles';
import { accessStrings } from '../../access.strings';

export function AccessDialog({
  open,
  onClose,
  busy = false,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o || busy ? undefined : onClose())}>
      <Dialog.Portal>
        <DimBackdrop />
        <Dialog.Content
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onPointerDownOutside={(e) => busy && e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface p-5 shadow-soft"
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Emails({ title, emails, why }: { title: string; emails: string[]; why?: string }) {
  if (!emails.length) return null;
  return (
    <div>
      <p className="font-medium text-ink">
        {title}
        {accessStrings.open}
        {emails.length}
        {accessStrings.close}
        {why ? (
          <span className="font-normal text-muted">
            {accessStrings.sep}
            {why}
          </span>
        ) : null}
      </p>
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs break-all text-muted">
        {emails.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

/** «Listo», closing a popup once it is done. */
export function DoneButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-5 flex justify-end">
      <button type="button" onClick={onClick} className={`${button.base} ${button.primary}`}>
        {accessStrings.result.done}
      </button>
    </div>
  );
}
