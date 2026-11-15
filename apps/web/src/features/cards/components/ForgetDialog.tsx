// The dialog of «Olvidar…»: the selected cards go back to new, with their counts reset if asked.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Switch } from '../../../shared/ui/Switch';
import { button } from '../../../shared/ui/styles';
import { DimBackdrop } from '../../../shared/ui/Dialog';

export function ForgetDialog({
  open,
  count,
  onCancel,
  onForget,
}: {
  open: boolean;
  count: number;
  onCancel: () => void;
  onForget: (reset: boolean) => void;
}) {
  const [reset, setReset] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <DimBackdrop />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-soft">
          <Dialog.Title className="text-lg font-semibold">Olvidar</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {count === 1 ? 'La tarjeta vuelve' : `Las ${count} tarjetas vuelven`} a ser{' '}
            {count === 1 ? 'nueva' : 'nuevas'}, en su posición original, sin su historial de
            memoria. El historial de repasos se conserva.
          </Dialog.Description>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <Switch
              label="Reiniciar los contadores de repasos y olvidos"
              checked={reset}
              onChange={setReset}
            />
            Reiniciar los contadores de repasos y olvidos
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={`${button.base} ${button.secondary}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onForget(reset)}
              className={`${button.base} ${button.primary}`}
            >
              Olvidar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
