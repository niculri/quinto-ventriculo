// The content database's `jsonb` values in and out of the code's types: the generated types only say `Json`, so these
// two are the one place where that shape is taken on trust.
import type { Json } from '@qv/db-types/content';

/** A `jsonb` value (a column or a function's result) as the shape the code expects, unchecked. */
export const fromJson = <T>(value: Json | null): T => value as unknown as T;

/** A value for a `jsonb` argument: an interface without an index signature is not `Json` for TypeScript. */
export const toJson = (value: object): Json => value as Json;
