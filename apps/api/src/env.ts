// What the middlewares put in Hono's context for the routes that follow them.
import type { SiteSettings } from '@qv/schema';
import type { ContentRepository } from './ports/content';
import type { User } from './ports/session';

/** What the request's `Authorization` carried: no token, a token that does not verify (`user` null) or a student's. */
export interface VerifiedSession {
  token: string | null;
  user: User | null;
}

export type AppEnv = {
  Variables: {
    /** Set by the first middleware that asks who is calling (the rate limit), read by the session after. */
    verified: VerifiedSession | undefined;
    user: User;
    token: string;
    repository: ContentRepository;
    settings: SiteSettings;
    hidden: ReadonlySet<string>;
    /** The administrator is in the admin mode: the draft, and what is off for the students. */
    preview: boolean;
    /** Set by `revalidate` on a student's read with a known content version: what the shared cache keys on. */
    validator: { tag: string; nowSec: number } | undefined;
  };
};
