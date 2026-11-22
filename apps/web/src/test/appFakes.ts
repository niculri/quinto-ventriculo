// A fake fetch for a supabase-js client of the users database (no network), which the test itself creates: the test
// answers each request as PostgREST would, and every request is kept to look at.

export interface UsersDbCall {
  method: string;
  /** The table or the function (`rpc/<name>` → `<name>`). */
  name: string;
  rpc: boolean;
  search: URLSearchParams;
  headers: Headers;
  body: unknown;
}

export interface UsersDbAnswer {
  status?: number;
  body?: unknown;
}

export const USERS_DB_URL = 'https://users.example.test';
export const USERS_DB_KEY = 'publishable-test-key';
export const NO_AUTH = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function usersDbFetch(
  answer: (call: UsersDbCall) => UsersDbAnswer | undefined = () => undefined,
) {
  const calls: UsersDbCall[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
    const path = url.pathname.replace(/^\/rest\/v1\//, '');
    const call: UsersDbCall = {
      method: req.method,
      name: path.replace(/^rpc\//, ''),
      rpc: path.startsWith('rpc/'),
      search: url.searchParams,
      headers: req.headers,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    };
    calls.push(call);
    const { status = 200, body = call.method === 'GET' ? [] : null } = answer(call) ?? {};
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetch, calls };
}

/** A refusal of the database as PostgREST sends it. */
export const refusal = (code: string, message: string, details: string | null = null) => ({
  status: 400,
  body: { code, message, details, hint: null },
});
