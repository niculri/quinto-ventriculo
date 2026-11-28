// What is kept of a browser's error report, how many a minute are taken, and the panel's list of them.
import { ERRORS_SHOWN } from '@qv/schema';
import type { ClientErrorGroup, ClientErrorPeriod, ClientErrorsReport } from '@qv/schema';

/** Emails and long runs of letters and digits (tokens, ids) out, in case a message carries them. */
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '(correo)')
    .replace(/[A-Za-z0-9_-]{24,}/g, '…')
    .slice(0, 300);
}

/** The same for a stack, line by line: at most 15 lines, each of 200 characters. */
export function scrubStack(stack: string): string {
  return stack
    .split('\n')
    .slice(0, 15)
    .map((line) =>
      line
        .replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '(correo)')
        .replace(/[A-Za-z0-9_-]{24,}/g, '…')
        .trimEnd()
        .slice(0, 200),
    )
    .join('\n')
    .slice(0, 1500);
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

export function clientErrorsReport(
  groups: ClientErrorGroup[],
  days: ClientErrorPeriod,
): ClientErrorsReport {
  return { days, groups: groups.slice(0, ERRORS_SHOWN), more: groups.length > ERRORS_SHOWN };
}
