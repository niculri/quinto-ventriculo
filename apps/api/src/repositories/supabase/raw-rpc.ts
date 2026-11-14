// The content database's RPCs over plain HTTP, for the reads the Worker passes on as a stream.
import type { Database } from '@qv/db-types/content';

type Schema = 'public' | 'draft';
type Functions<S extends Schema> = Database[S]['Functions'];
/**
 * The arguments of `fn` in `S`: `{}` for one without arguments, as supabase-js sends it, and `null` for any of them,
 * which SQL takes and the generated types leave out.
 */
type ArgsOf<S extends Schema, F extends keyof Functions<S>> = Functions<S>[F] extends {
  Args: infer A;
}
  ? [A] extends [never]
    ? Record<string, never>
    : { [K in keyof A]: A[K] | null }
  : never;
/** With `S` either schema, only the functions both have: what the preview reads must exist in the draft. */
type RawRpc<S extends Schema> = <F extends keyof Functions<S> & string>(
  fn: F,
  args: ArgsOf<S, F>,
) => Promise<ReadableStream<Uint8Array>>;

/** An RPC called as supabase-js calls it, but returning the response body unparsed. */
export function rawRpcOf(url: string, serviceKey: string): RawRpc<'public'>;
export function rawRpcOf<S extends Schema>(url: string, serviceKey: string, schema: S): RawRpc<S>;
export function rawRpcOf(url: string, serviceKey: string, schema: Schema = 'public') {
  return async (fn: string, args: object) => {
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(schema === 'public' ? {} : { 'Content-Profile': schema }),
      },
      body: JSON.stringify(args),
    });
    if (!r.ok || !r.body) {
      const detail = await r.text().catch(() => '');
      throw new Error(`Content database (${fn}): ${r.status} ${detail.slice(0, 300)}`);
    }
    return r.body;
  };
}
