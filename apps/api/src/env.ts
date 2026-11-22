// What the middlewares put in Hono's context for the routes that follow them.
import type { SiteSettings } from '@qv/schema';
import type { ContentRepository } from './ports/content';
import type { User } from './ports/session';

export type AppEnv = {
  Variables: {
    user: User;
    token: string;
    repository: ContentRepository;
    settings: SiteSettings;
    hidden: ReadonlySet<string>;
    /** The administrator is in the admin mode: the draft, and what is off for the students. */
    preview: boolean;
  };
};
