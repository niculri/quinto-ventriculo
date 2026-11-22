// What the API keeps of the pages that fail in the students' browsers, and reads back.
import type { ClientErrorGroup, ClientErrorReport } from '@qv/schema';

/** Never awaited and never fails, like the opens. */
export interface ClientErrorRecorder {
  record(report: ClientErrorReport): void;
}

export interface ClientErrorsReader {
  read(): Promise<ClientErrorGroup[]>;
}
/** The most groups a reader gives back. */
export const ERRORS_SHOWN = 50;
