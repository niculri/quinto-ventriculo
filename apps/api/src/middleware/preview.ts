// The admin mode: an administrator who asks for it reads the draft, and the answer is never kept by the browser.
import { PREVIEW_HEADER, PREVIEW_VALUE, PreviewRequest, PublishedSource } from '@qv/schema/http';
import type { Context } from 'hono';
import type { Dependencies } from '../dependencies';
import type { AppEnv } from '../env';
import type { ContentRepository } from '../ports/content';
import type { Guard } from './guard';

export const selectRepository =
  (deps: Dependencies): Guard =>
  async (c) => {
    // The preview header is part of the cache key, so a cached answer of the draft never stands for the published one.
    c.header('Vary', `Authorization, ${PREVIEW_HEADER}`);
    const asksPreview = PreviewRequest.safeParse(c.req.header(PREVIEW_HEADER)).success;
    if (asksPreview && deps.preview && (await deps.admins.isAdmin(c.get('token')))) {
      c.header('Cache-Control', 'no-store');
      c.header(PREVIEW_HEADER, PREVIEW_VALUE);
      c.set('repository', deps.preview);
      c.set('preview', true);
    } else {
      c.header('Cache-Control', 'private, max-age=60');
      c.set('repository', deps.repository);
      c.set('preview', false);
    }
    return undefined;
  };

/**
 * The administrator in the admin mode asking for what the students have, a course turned off included (to tell, in
 * the web, what only the draft has). For anybody else the query is nothing: they get the published anyway.
 */
export const asksPublished = (c: Context<AppEnv>) =>
  c.get('preview') && PublishedSource.safeParse(c.req.query('source')).success;

/** The repository a read goes to: the published one when the admin mode asked for it, the request's otherwise. */
export const readRepository = (deps: Dependencies, c: Context<AppEnv>): ContentRepository =>
  asksPublished(c) ? deps.repository : c.get('repository');
