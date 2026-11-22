// How the API reads the record of what was taken off the site.
import type { UnpublishedLog } from '@qv/schema';

export interface UnpublishedRepository {
  log(): Promise<UnpublishedLog>;
}
