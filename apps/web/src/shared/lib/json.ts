// The users database's `jsonb` values in and out of the code's types: an answer is checked against its contract (and
// goes on as it came when it does not fit), and a value whose shape the code does not know goes out as `Json`.
import type { Json } from '@qv/db-types/users';
import { checked } from '@qv/schema/database';
import type { Infer, Schema } from '@qv/schema/database';

export const fromDatabase = <S extends Schema>(fn: string, schema: S, value: unknown): Infer<S> =>
  checked(`users database (${fn})`, schema, value);

/** For a value the code types `unknown` (a test's round, a preset's options): the database checks its shape. */
export const toJson = (value: unknown): Json => value as Json;
