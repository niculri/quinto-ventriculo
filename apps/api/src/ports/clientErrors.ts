// What the API keeps of the pages that fail in the browsers, and reads back for the panel's «Errores».
import type { ClientErrorGroup, ClientErrorPeriod, ClientErrorReport } from '@qv/schema';

/** A report as it is kept: the browser's, with what the Worker adds (from the User-Agent and the session). */
export interface ClientErrorPoint extends ClientErrorReport {
  os: string;
  browser: string;
  phone: boolean | null;
  /** The account of a valid session; null without one. */
  account: string | null;
}

/** Never awaited and never fails, like the opens. */
export interface ClientErrorRecorder {
  record(point: ClientErrorPoint): void;
}

export interface ClientErrorsReader {
  /** Last first, at most `ERRORS_SHOWN + 1` groups (the one more says there are more). */
  read(days: ClientErrorPeriod): Promise<ClientErrorGroup[]>;
}

export const NO_CLIENT_ERRORS: ClientErrorRecorder = { record: () => undefined };

export const NO_CLIENT_ERRORS_READER: ClientErrorsReader = {
  read: () => Promise.reject(new Error('The browsers’ errors are not configured')),
};
