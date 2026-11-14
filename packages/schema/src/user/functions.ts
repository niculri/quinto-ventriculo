// The users database's functions by name (from the generated types), so that a contract only names one that exists.
import type { Database } from '@qv/db-types/users';
import type { RpcContract } from '../database/contract';

export type UsersFunction = keyof Database['public']['Functions'];

export type UsersContracts = Partial<Record<UsersFunction, RpcContract>>;
