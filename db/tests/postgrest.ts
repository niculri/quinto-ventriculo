// A small PostgREST over PGlite for tests: the requests supabase-js sends (RPC with named arguments, table reads,
// inserts, upserts, updates and deletes with the filters the web uses) run as the signed-in user, as in Supabase.
import type { PGlite } from '@electric-sql/pglite';
import { asUser } from './pglite';
import { pick, query, quote, Sql, Unsupported, write } from './postgrest-sql';
import type { Tx } from './postgrest-sql';

export interface Person {
  sub: string;
  email: string;
  session_id: string;
}

/** An auth user with an open session (and an invitation, unless told otherwise): the claims of their token. */
export async function signIn(
  db: PGlite,
  email: string,
  options: { invited?: boolean; list?: string; name?: string } = {},
): Promise<Person> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, last_sign_in_at, raw_user_meta_data) values ($1, now(), $2) returning id`,
    [email, JSON.stringify(options.name ? { name: options.name } : {})],
  );
  const sub = rows[0]!.id;
  if (options.invited ?? true) {
    await db.query(
      `insert into public.invited_emails (email, list) values ($1, $2) on conflict (email) do nothing`,
      [email, options.list ?? 'curso'],
    );
  }
  const session = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id) values ($1) returning id`,
    [sub],
  );
  const session_id = session.rows[0]!.id;
  await db.query(
    `insert into auth.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)`,
    [`rt-${session_id}`, sub, session_id],
  );
  return { sub, email, session_id };
}

/** A `fetch` that answers the users or content database's REST API from PGlite, as `who`. */
export function postgrestFetch(db: PGlite, who: () => Person | null) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
    const headers = Object.fromEntries([...req.headers].map(([k, v]) => [k.toLowerCase(), v]));
    try {
      const rows = await asUser(db, who(), async (tx) => {
        await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]);
        return answer(tx, req.method, url, text ? (JSON.parse(text) as unknown) : null, headers);
      });
      return respond(rows, req.method, headers);
    } catch (e) {
      if (e instanceof Unsupported) {
        throw new Error(`postgrestFetch: unsupported ${e.message}`, { cause: e });
      }
      return errorResponse(e);
    }
  };
}

interface Rows {
  value: unknown;
  /** A table read or a set-returning function: a list of rows. */
  list: boolean;
  /** A function that returns nothing, or a write without return=representation. */
  empty: boolean;
}

async function answer(
  tx: Tx,
  method: string,
  url: URL,
  body: unknown,
  headers: Record<string, string>,
): Promise<Rows> {
  // The path after the REST prefix: «rpc/<function>» or «<table>».
  const parts = url.pathname.split('/').filter(Boolean).slice(2);
  if (parts[0] === 'rpc' && parts.length === 2) return callFunction(tx, parts[1]!, body, url);
  if (parts.length !== 1) throw new Unsupported(`path ${url.pathname}`);
  const table = parts[0]!;
  if (method === 'GET') {
    return {
      value: await query(tx, new Sql(), `public.${quote(table)}`, url),
      list: true,
      empty: false,
    };
  }
  const returning = (headers.prefer ?? '').includes('return=representation');
  const value = await write(tx, method, table, url, body, headers.prefer ?? '');
  return {
    value: returning ? pick(value as Record<string, unknown>[], url) : null,
    list: true,
    empty: !returning,
  };
}

async function callFunction(tx: Tx, fn: string, body: unknown, url: URL): Promise<Rows> {
  const args = (body ?? {}) as Record<string, unknown>;
  const sig = await signature(tx, fn, Object.keys(args));
  const sql = new Sql();
  const record = sig.args.filter((a) => a.name in args);
  const call = `public.${quote(fn)}(${record.map((a) => `${quote(a.name)} => _a.${quote(a.name)}`).join(', ')})`;
  const from = record.length
    ? `from json_to_record(${sql.add(JSON.stringify(args))}::json) as _a(${record
        .map((a) => `${quote(a.name)} ${a.type}`)
        .join(', ')})`
    : '';
  if (sig.set) {
    const rows = `select _f.* ${from ? `${from}, lateral ${call} as _f` : `from ${call} as _f`}`;
    return { value: await query(tx, sql, `(${rows})`, url), list: true, empty: false };
  }
  if (sig.returns === 'void') {
    await tx.query(`select ${call} ${from}`, sql.params);
    return { value: null, list: false, empty: true };
  }
  const { rows } = await tx.query<{ r: unknown }>(
    `select to_json(${call}) as r ${from}`,
    sql.params,
  );
  return { value: rows[0]!.r, list: false, empty: false };
}

async function signature(tx: Tx, fn: string, given: string[]) {
  const { rows } = await tx.query<{
    names: string[] | null;
    types: string[];
    set: boolean;
    returns: string;
  }>(
    `select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) as t) as types,
            p.proretset as set, p.prorettype::regtype::text as returns
       from pg_proc p where p.proname = $1 and p.pronamespace = 'public'::regnamespace`,
    [fn],
  );
  const fits = rows.filter((r) => given.every((g) => (r.names ?? []).includes(g)));
  if (fits.length !== 1) {
    throw Object.assign(new Error(`Could not find the function public.${fn}`), {
      code: 'PGRST202',
    });
  }
  const r = fits[0]!;
  return {
    args: r.types.map((type, i) => ({ name: r.names![i]!, type })),
    set: r.set,
    returns: r.returns,
  };
}

function respond(rows: Rows, method: string, headers: Record<string, string>): Response {
  if (rows.empty) return new Response(null, { status: method === 'POST' ? 201 : 204 });
  let value = rows.value;
  if ((headers.accept ?? '').startsWith('application/vnd.pgrst.object+json') && rows.list) {
    const list = value as unknown[];
    if (list.length !== 1) {
      return json(406, {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
        details: `The result contains ${list.length} rows`,
        hint: null,
      });
    }
    value = list[0];
  }
  return json(method === 'POST' && rows.list ? 201 : 200, value);
}

function errorResponse(e: unknown): Response {
  const error = e as { code?: string; message?: string; detail?: string; hint?: string };
  const status = error.code === 'PGRST202' ? 404 : error.code === '42501' ? 403 : 400;
  return json(status, {
    code: error.code ?? '',
    message: error.message ?? String(e),
    details: error.detail ?? null,
    hint: error.hint ?? null,
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let clients = 0;

/** What `createClient` takes to talk to this fake as `who`: a URL, a key and the options with its `fetch`. */
export function fakeSupabase(db: PGlite, who: () => Person | null) {
  return {
    url: 'https://users.example.test',
    key: 'publishable-test-key',
    options: {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        // One per client, so that several in a test are not taken for one used twice.
        storageKey: `fake-supabase-${++clients}`,
      },
      global: { fetch: postgrestFetch(db, who) },
    },
  };
}
