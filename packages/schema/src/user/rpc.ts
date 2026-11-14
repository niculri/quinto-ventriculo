// Every contract of the users database's functions that take or give `jsonb`, by name.
import { z } from 'zod';
import { rpcContract } from '../database/contract';
import { AdminUsageRow } from '../http/usage';
import { ACCESS_RPC } from './access';
import { ACCOUNT_RPC } from './account';
import type { UsersContracts } from './functions';
import { QUIZ_RPC } from './quiz-progress';
import { REPORTS_RPC } from './reports-rpc';
import { STUDY_RPC } from './study-rpc';

const Group = z.string().nullable();

/** Called by the Worker with the administrator's token; the API checks its answer with `AdminUsageRow` too. */
const USAGE_RPC = {
  admin_usage: rpcContract(
    z.object({
      p: z
        .object({
          decks: z.record(z.string(), z.tuple([Group, Group, Group])),
          quizzes: z.record(z.string(), z.tuple([Group, Group])),
        })
        .optional(),
    }),
    AdminUsageRow,
  ),
} satisfies UsersContracts;

export const USERS_RPC = {
  ...STUDY_RPC,
  ...QUIZ_RPC,
  ...ACCOUNT_RPC,
  ...ACCESS_RPC,
  ...REPORTS_RPC,
  ...USAGE_RPC,
} satisfies UsersContracts;
