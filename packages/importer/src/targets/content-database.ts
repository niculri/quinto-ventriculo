// The content database in Supabase, reached through its functions (`rpc`): the only place the importer talks to it.
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@qv/db-types/content';
import type { CloudConfig } from './cloud-config';

/** `draft` mirrors `public` with the same functions, and only an administrator sees it. */
export type ContentSchema = 'public' | 'draft';

/** The functions of `public`, or of both schemas when it can be either. */
export type FunctionName<S extends ContentSchema> = keyof Database[S]['Functions'] & string;

export interface ContentDatabase<S extends ContentSchema = 'public'> {
  rpc(
    fn: FunctionName<S>,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

type Config = Pick<CloudConfig, 'contentUrl' | 'contentServiceKey'>;

/** For `draft`, PostgREST has to expose the schema (Supabase: Settings → API → Exposed schemas). */
export function contentDatabase(config: Config): ContentDatabase;
export function contentDatabase(
  config: Config,
  schema: ContentSchema,
): ContentDatabase<ContentSchema>;
export function contentDatabase(
  config: Config,
  schema: ContentSchema = 'public',
): ContentDatabase<ContentSchema> {
  const client = createClient<Database>(config.contentUrl, config.contentServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // The importer's arguments are its bundle's shapes, not `Json`: the functions check them (`jsonb` mostly).
  const loose = (args: Record<string, unknown>) => args as Record<string, Json>;
  if (schema === 'public') return { rpc: (fn, args) => client.rpc(fn, loose(args)) };
  const draft = client.schema(schema);
  return { rpc: (fn, args) => draft.rpc(fn, loose(args)) };
}
