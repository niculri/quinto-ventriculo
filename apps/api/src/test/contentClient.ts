// A content database client that answers what the test says for each table (`from:notes`) and function (`rpc:quiz`),
// and keeps what was asked.
import type { ContentClient, SchemaClient } from '../adapters/supabase/client';

export type Answer =
  | { data: unknown; error: null }
  | { data: null; error: { message: string; code?: string; details?: string; hint?: string } };

export const ok = (data: unknown): Answer => ({ data, error: null });
export const failed = (message: string, code?: string, details?: string): Answer => ({
  data: null,
  error: { message, ...(code ? { code } : {}), ...(details ? { details } : {}) },
});

export type Asked = { key: string; args?: unknown; range?: [number, number]; filters: string[] };
type Given = Answer | ((asked: Asked) => Answer);

export function fakeContentClient(answers: Record<string, Given>) {
  const calls: Asked[] = [];
  const answer = (asked: Asked): Promise<Answer> => {
    calls.push(asked);
    const given = answers[asked.key];
    if (!given) throw new Error(`the test did not say what ${asked.key} answers`);
    return Promise.resolve(typeof given === 'function' ? given(asked) : given);
  };
  const query = (key: string, args?: unknown) => {
    const asked: Asked = { key, args, filters: [] };
    const q = {
      select: () => q,
      eq: (column: string, value: unknown) => {
        asked.filters.push(`${column}=${String(value)}`);
        return q;
      },
      range: (from: number, to: number) => {
        asked.range = [from, to];
        return answer(asked);
      },
      maybeSingle: () => answer(asked),
      then: (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) =>
        answer(asked).then(resolve, reject),
    };
    return q;
  };
  const client = {
    schema: () => client,
    from: (table: string) => query(`from:${table}`),
    rpc: (fn: string, args?: unknown) => query(`rpc:${fn}`, args),
  };
  return {
    client: client as unknown as ContentClient,
    /** The client of one schema, as the readers of the catalog take it. */
    db: client as unknown as SchemaClient,
    calls,
  };
}
