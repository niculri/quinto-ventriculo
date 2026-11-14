// The databases' functions as contracts and their errors as typed errors: `@qv/schema/database`.
export { checked } from './contract';
export type { Infer, RpcArgs, RpcResult, Schema } from './contract';
export { databaseError } from './errors';
export type { DbErrorLike, DbReason, SqlState } from './errors';
