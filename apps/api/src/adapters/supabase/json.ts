// The content database's `jsonb` answers checked against their contract in @qv/schema/content: one that does not fit
// is logged and goes on as it came; where the Worker parses it after, that `parse` decides.
import { checked } from '@qv/schema/database';
import type { Infer, Schema } from '@qv/schema/database';

export const fromDatabase = <S extends Schema>(fn: string, schema: S, value: unknown): Infer<S> =>
  checked(`Content database (${fn})`, schema, value);
