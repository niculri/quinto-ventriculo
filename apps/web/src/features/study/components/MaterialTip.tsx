// The one-time tip that «Ver apunte» is in «Más»: a bubble under the button, over the card, so it moves nothing; closed,
// it does not come back.
import { X } from 'lucide-react';
import { tapArea } from '../../../shared/ui/styles';
import { materialTipStrings } from './strings/MaterialTip.strings';

export function MaterialTip({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="note"
      className="absolute top-full right-0 z-20 mt-1 flex max-w-[min(18rem,calc(100vw-1rem))] items-start gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink shadow-soft"
    >
      <span>{materialTipStrings.material.tip}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label={materialTipStrings.material.closeTip}
        className={`flex-none rounded p-0.5 text-muted hover:bg-surface-2 hover:text-ink ${tapArea}`}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
