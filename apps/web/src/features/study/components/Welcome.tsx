// The simple mode's welcome: how studying works here, shown until it is closed once.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { button } from '../../../shared/ui/styles';
import type { StudyPreferences } from '../../progress/api/repository';
import { useSavePreferences } from '../../progress/hooks/useStudy';
import { BlurredBackdrop } from '../../../shared/ui/Dialog';
import { studyStrings } from '../strings';

export function Welcome({ prefs }: { prefs: StudyPreferences }) {
  const [open, setOpen] = useState(true);
  const save = useSavePreferences();
  const close = () => {
    setOpen(false);
    save.mutate({ ...prefs, welcomeSeen: true });
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? null : close())}>
      <Dialog.Portal>
        <BlurredBackdrop />
        <Dialog.Content
          className="fixed top-4 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:top-[16vh]"
          // Focus does not go to a button behind: space and Enter have to show the answer.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="font-serif text-xl font-semibold">
            {studyStrings.welcome.title}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-muted">
            {studyStrings.welcome.text}
          </Dialog.Description>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={close} className={`${button.base} ${button.primary}`}>
              {studyStrings.welcome.ok}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
