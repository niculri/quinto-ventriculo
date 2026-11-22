// The table's sidebar as a panel, for screens without the right column.

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { DimBackdrop, GhostCloseX } from '../../../shared/ui/Dialog';
import { columnsStrings } from '../model/strings/columns.strings';

export function SidebarDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <DimBackdrop />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm overflow-y-auto bg-surface p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="font-semibold">{columnsStrings.table.sidebar}</Dialog.Title>
            <GhostCloseX />
          </div>
          <Dialog.Description className="sr-only">
            {columnsStrings.table.sidebarHelp}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
