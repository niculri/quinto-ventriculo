// What the API keeps of the pages that fail in the students' browsers, and reads back.
import type { ClientErrorGroup, ClientErrorReport } from '@qv/schema';

/** Never awaited and never fails, like the opens. */
export interface ClientErrorRecorder {
  record(report: ClientErrorReport): void;
}

export interface ClientErrorsReader {
  read(): Promise<ClientErrorGroup[]>;
}

export const NO_CLIENT_ERRORS: ClientErrorRecorder = { record: () => undefined };

export const NO_CLIENT_ERRORS_READER: ClientErrorsReader = {
  read: () => Promise.reject(new Error('The browsers’ errors are not configured')),
};

/** The most groups a reader gives back. */
export const ERRORS_SHOWN = 50;
