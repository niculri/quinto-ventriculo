// The popups over the site after entering: the deletion that entering cancelled and a new version of the texts.
import * as Dialog from '@radix-ui/react-dialog';
import { button } from '../../../shared/ui/styles';
import { GateDialog } from './GateDialog';
import { gateStrings as s } from '../gate.strings';

export function CancelledNotice({ onTold }: { onTold: () => void }) {
  return (
    <GateDialog title={s.cancelledTitle}>
      <Dialog.Description className="text-sm leading-relaxed text-muted">
        {s.cancelled}
      </Dialog.Description>
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onTold} className={`${button.base} ${button.primary}`}>
          {s.understood}
        </button>
      </div>
    </GateDialog>
  );
}

export function NewVersionNotice() {
  return (
    <GateDialog title={s.newVersionTitle}>
      <Dialog.Description className="text-sm leading-relaxed text-muted">
        {s.newVersion}
      </Dialog.Description>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${button.base} ${button.primary}`}
        >
          {s.reload}
        </button>
      </div>
    </GateDialog>
  );
}
