// The simple mode's welcome: how studying works here, shown until it is closed once.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { button } from '../../../shared/ui/styles';
import type { StudyPreferences } from '../../progress/api/repository';
import { useSavePreferences } from '../../progress/queries';
import { BlurredBackdrop } from '../../../shared/ui/Dialog';

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
            Cómo se estudia aquí
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-muted">
            Intenta acordarte, muestra la respuesta y elige «Otra vez» si no te la sabías o «Bien»
            si te la sabías. Cada tarjeta vuelve justo cuando estás por olvidarla: unos minutos al
            día rinden más que una tarde antes de la prueba.
          </Dialog.Description>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={close} className={`${button.base} ${button.primary}`}>
              Entendido
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
