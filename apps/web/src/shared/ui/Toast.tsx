// The site's short messages at the bottom of the screen: the bubble, the live region that announces it, and the one
// that shows a status for a while.
import type { ReactNode } from 'react';

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
