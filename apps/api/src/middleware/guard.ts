// A step of a middleware: it answers (and the request stops there) or returns nothing (and the next step goes on).
import type { Context } from 'hono';
import type { AppEnv } from '../env';

export type Guard = (c: Context<AppEnv>) => Promise<Response | undefined>;
