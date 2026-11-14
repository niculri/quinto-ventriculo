// A database function's contract (the schema of its arguments and of what it returns) and the check of a read, which
// logs what does not fit instead of breaking the page.
import { z } from 'zod';

/** A function without arguments: the client sends none. */
export const NoArgs = z.undefined();

export interface RpcContract<A extends z.ZodType = z.ZodType, R extends z.ZodType = z.ZodType> {
  args: A;
  returns: R;
}

export const rpcContract = <A extends z.ZodType, R extends z.ZodType>(
  args: A,
  returns: R,
): RpcContract<A, R> => ({ args, returns });

/**
 * A schema and the type of a value that fits it, for code that does not depend on zod itself. It is the schema's
 * input: `checked` gives the value as it came, without any default or transform applied.
 */
export type Schema = z.ZodType;
export type Infer<S extends Schema> = z.input<S>;

export type RpcArgs<C extends RpcContract> = z.infer<C['args']>;
export type RpcResult<C extends RpcContract> = z.infer<C['returns']>;

const LOGGED_ISSUES = 5;

/**
 * `value` as its schema's input type. It is returned as it came, also when it fits (no key is stripped nor any default
 * filled in); when it does not, it goes on the same and the problem is logged with where it came from and the paths
 * and kinds of the first issues, never the values (they are a student's data).
 */
export function checked<S extends z.ZodType>(
  source: string,
  schema: S,
  value: unknown,
): z.input<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.slice(0, LOGGED_ISSUES).map((i) => ({
      path: i.path.join('.'),
      code: i.code,
      ...('expected' in i ? { expected: i.expected } : {}),
    }));
    console.error(`${source}: unexpected shape`, { issues, total: r.error.issues.length });
  }
  return value as z.input<S>;
}
