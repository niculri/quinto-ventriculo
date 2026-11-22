// What is kept of a browser's error report, and how many a minute are taken.
/** Emails and long runs of letters and digits (tokens, ids) out, in case a message carries them. */
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '(correo)')
    .replace(/[A-Za-z0-9_-]{24,}/g, '…')
    .slice(0, 300);
}

/** At most `limit` reports a minute in each isolate: a page in a loop, or someone sending on purpose, stops there. */
export function errorBudget(limit: number, now: () => number) {
  let minute = -1;
  let used = 0;
  return () => {
    const m = Math.floor(now() / 60_000);
    if (m !== minute) {
      minute = m;
      used = 0;
    }
    if (used >= limit) return false;
    used += 1;
    return true;
  };
}
