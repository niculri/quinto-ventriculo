// The catalog a request gets: the draft or the published one, the sections the administrator turned off marked or
// left out, and the semesters without material hidden when the settings say so.
import type { Catalog, SiteSettings } from '@qv/schema';
import { markAdminOnly, withoutEmptySemesters } from '@qv/schema/http';
import type { ContentRepository } from '../ports/content';

export interface CatalogRequest {
  /** What `requireSession` and `visibleContent` chose for the request. */
  repository: ContentRepository;
  published: ContentRepository;
  preview: boolean;
  /** The admin mode asking for what the students have. */
  asksPublished: boolean;
  settings: SiteSettings;
}

export async function catalogFor(request: CatalogRequest): Promise<Catalog> {
  const { repository, published, settings } = request;
  if (request.asksPublished) return published.catalog();
  if (request.preview) {
    const [draft, current] = await Promise.all([repository.catalog(), published.catalog()]);
    return markAdminOnly(draft, current, settings);
  }
  const catalog = await repository.catalog();
  return settings.hideEmptySemesters ? withoutEmptySemesters(catalog) : catalog;
}
