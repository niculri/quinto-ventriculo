// Hands the errors React catches to public/error-report.js, which sends them without who; and keeps logging them in
// the console, as React does when nobody asks it for them.
type Reporter = (kind: 'chunk' | 'render', message: string) => void;

const CHUNK =
  /dynamically imported module|Importing a module script failed|error loading dynamically/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (error && typeof error === 'object' && 'statusText' in error) {
    const e = error as { status?: number | string | null; statusText?: string | null };
    return `${e.status ?? ''} ${e.statusText ?? ''}`.trim();
  }
  return String(error);
}

export function reportError(error: unknown): void {
  console.error(error);
  const report = (window as unknown as { __qvReportError?: Reporter }).__qvReportError;
  if (!report) return;
  try {
    const message = messageOf(error);
    report(CHUNK.test(message) ? 'chunk' : 'render', message);
  } catch {
    // an error report never breaks the page
  }
}

/** The options of `createRoot`: what React catches and what nothing catches go through `reportError`. */
export const ROOT_ERROR_HANDLERS = { onCaughtError: reportError, onUncaughtError: reportError };
