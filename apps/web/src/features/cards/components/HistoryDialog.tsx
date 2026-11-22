// The viewer's «Historial de la tarjeta»: when the card was studied and what was answered (less in the simple mode).

import * as Dialog from '@radix-ui/react-dialog';
import { timingFor } from '@qv/study';
import type { StudyPreferences } from '@qv/schema/user';
import { GhostCloseX } from '../../../shared/ui/Dialog';
import type { BrowseCard } from '../model/browseCards';
import { CardInfo } from './CardPreview';
import { historyDialogStrings } from './strings/HistoryDialog.strings';

export function HistoryDialog({
  open,
  onOpenChange,
  info,
  prefs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: BrowseCard;
  prefs: StudyPreferences;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[60] max-h-[85dvh] w-[min(94vw,34rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">
              {historyDialogStrings.viewer.historyTitle}
            </Dialog.Title>
            <GhostCloseX />
          </div>
          <Dialog.Description className="sr-only">
            {historyDialogStrings.viewer.historyHelp}
          </Dialog.Description>
          <CardInfo card={info} timing={timingFor(prefs)} simple={!prefs.fullAnki} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
