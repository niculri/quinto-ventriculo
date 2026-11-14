// For the batteries that run an in-memory repository and the Supabase adapter over the SQL (PGlite) with the same
// steps: each step's result or error, with the moments and ids that only have to match in shape made comparable.

/** Building a database from its migrations takes about a second, and many more with the machine busy. */
export const DATABASE_TIMEOUT = 60_000;

type Outcome = { value: unknown } | { error: string };

async function outcome(step: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { value: await step() };
  } catch (e) {
    // Some adapters throw supabase-js's error as it comes: an object with a message.
    const message = e && typeof e === 'object' && 'message' in e ? e.message : e;
    return { error: String(message) };
  }
}

export interface Both {
  /** Each step's outcome, normalized. */
  sql: unknown;
  memory: unknown;
  /** The values as they came, to check their shape with the domain's schema. */
  raw: { sql: unknown[]; memory: unknown[] };
}

/**
 * The same steps on each repository, one after the other. `only` leaves out of each value, before comparing, what only
 * has to match in shape.
 */
export async function onBoth<R>(
  sql: R,
  memory: R,
  steps: ((repo: R) => Promise<unknown>)[],
  only: (value: unknown) => unknown = (v) => v,
): Promise<Both> {
  const run = async (repo: R) => {
    const out: Outcome[] = [];
    for (const step of steps) {
      // Two steps never in the same millisecond: each side's clock tells them apart, as the database's does.
      await new Promise((r) => setTimeout(r, 2));
      out.push(await outcome(() => step(repo)));
    }
    return out;
  };
  const a = await run(sql);
  const b = await run(memory);
  const values = (list: Outcome[]) => list.map((o) => ('value' in o ? o.value : undefined));
  const compared = (list: Outcome[]) =>
    normalize(list.map((o) => ('value' in o ? { value: only(o.value) } : o)));
  return { sql: compared(a), memory: compared(b), raw: { sql: values(a), memory: values(b) } };
}

const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Each moment (an ISO string; «Z» and «+00:00» are the same) becomes `<tN>` and each uuid `<idN>`, N in the order they
 * first appear: two results match when they repeat the same moments and ids in the same places, whatever the clock or
 * the generator gave.
 */
function normalize<T>(value: T): unknown {
  const moments = new Map<number, string>();
  const ids = new Map<string, string>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (MOMENT.test(v)) {
        const at = Date.parse(v);
        if (!moments.has(at)) moments.set(at, `<t${moments.size + 1}>`);
        return moments.get(at);
      }
      if (UUID.test(v)) {
        if (!ids.has(v)) ids.set(v, `<id${ids.size + 1}>`);
        return ids.get(v);
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value);
}

/** Milliseconds between a moment and now plus `offsetMs`, to check what the clock decides only roughly. */
export const fromNow = (at: string, offsetMs = 0) =>
  Math.abs(Date.parse(at) - Date.now() - offsetMs);
