// The pieces the site's dialogs (Radix) share: the two backdrops and the buttons with an ✕ that close them.
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { button } from './styles';

export function BlurredBackdrop() {
  return <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />;
}

export function DimBackdrop() {
  return <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />;
}

export function CloseX({ label = 'Cerrar', disabled }: { label?: string; disabled?: boolean }) {
  return (
    <Dialog.Close
      aria-label={label}
      disabled={disabled}
      className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
    >
      <X className="size-4" aria-hidden="true" />
    </Dialog.Close>
  );
}

export function GhostCloseX() {
  return (
    <Dialog.Close className={`${button.base} ${button.ghost}`} aria-label="Cerrar">
      <X className="size-4" aria-hidden="true" />
    </Dialog.Close>
  );
}
