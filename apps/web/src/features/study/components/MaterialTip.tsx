// The one-time tip beside «Ver apunte», in the line's own room: it moves nothing, and closed it does not come back.
// Closed, its room stays until the visit ends, so that «Ver apunte» and «Preguntas» do not move.
import { X } from 'lucide-react';
import { tapArea } from '../../../shared/ui/styles';
import { materialTipStrings } from './strings/MaterialTip.strings';

export function MaterialTip({ show, onClose }: { show: boolean; onClose: () => void }) {
  return (
    <span
      aria-hidden={show ? undefined : true}
      className={`flex min-w-0 items-center gap-1 text-xs whitespace-nowrap text-ink ${show ? '' : 'invisible'}`}
    >
      <span className="truncate">{materialTipStrings.material.tip}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label={materialTipStrings.material.closeTip}
        className={`flex-none rounded p-0.5 text-muted hover:bg-surface-2 hover:text-ink ${tapArea}`}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}
