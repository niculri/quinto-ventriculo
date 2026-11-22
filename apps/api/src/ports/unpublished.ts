// How the API reads the record of what was taken off the site.
import type { UnpublishedLog } from '@qv/schema';

export interface UnpublishedRepository {
  log(): Promise<UnpublishedLog>;
}

/** The panel's route answers «no existe» before reaching it. */
export const NO_UNPUBLISHED: UnpublishedRepository = {
  log: () => Promise.reject(new Error('The unpublished record is not configured')),
};
