// The popup to confirm publishing or undoing: it does not close while it works, and a refusal stays in it.
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { DimBackdrop } from '../../../../shared/ui/Dialog';
import { button } from '../../../../shared/ui/styles';
import { confirmDialogStrings } from './strings/ConfirmDialog.strings';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirm,
  busy,
  busyLabel,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirm: string;
  busy: boolean;
  busyLabel: string;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    // While busy, «Cancelar» is off and Escape and a click outside are stopped, so nothing asks to close.
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <DimBackdrop />
        <Dialog.Content
          role="alertdialog"
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onPointerDownOutside={(e) => busy && e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface p-5 shadow-soft"
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-2 space-y-2 text-sm text-muted">{children}</div>
          </Dialog.Description>
          <div className="mt-3 min-h-[2.5rem]">
            {error ? (
              <p role="alert" className="text-sm text-state-learn">
                {error}
              </p>
            ) : null}
          </div>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close className={`${button.base} ${button.secondary}`} disabled={busy}>
              {confirmDialogStrings.confirm.cancel}
            </Dialog.Close>
            <button
              type="button"
              className={`${button.base} ${button.primary}`}
              disabled={busy}
              onClick={onConfirm}
            >
              {/* The longest of the two labels keeps the width; both in one cell, the visible one centered. The
                  grid goes inside: on the button itself, button.base's inline-flex won and put them side by side. */}
              <span className="grid place-items-center">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                  {busyLabel.length > confirm.length ? busyLabel : confirm}
                </span>
                <span className="col-start-1 row-start-1">{busy ? busyLabel : confirm}</span>
              </span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
