// The site's short messages at the bottom of the screen: the bubble, the live region that announces it, the one that
// shows a status for a while, and one with an action (Deshacer) that stays until closed.
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

function Toast({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">{children}</p>;
}

/** Always in the page, so a screen reader announces each message; `low` sits near the bottom edge. */
export function LiveToast({ message, low = false }: { message: ReactNode; low?: boolean }) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 ${low ? 'bottom-8' : 'bottom-24'} z-40 flex justify-center px-4`}
    >
      {message ? <Toast>{message}</Toast> : null}
    </div>
  );
}

export function StatusToast({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <Toast>{children}</Toast>
    </div>
  );
}

/** Over the page, nothing moves; it stays until its action or its ✕, so there is time to read it and use it. */
export function ActionToast({
  children,
  action,
  onAction,
  closeLabel,
  onClose,
}: {
  children: ReactNode;
  action: string;
  onAction: () => void;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-lg bg-ink py-1.5 pr-1.5 pl-4 text-sm text-bg shadow-soft">
        <span className="min-w-0">{children}</span>
        <button
          type="button"
          onClick={onAction}
          className="flex-none rounded px-2 py-1 font-semibold underline underline-offset-4 hover:bg-bg/15"
        >
          {action}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex size-8 flex-none items-center justify-center rounded hover:bg-bg/15"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
