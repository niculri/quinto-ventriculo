// Zod schemas of the account: the accepted versions of the legal texts and the state on entering.
import { z } from 'zod';
import { NoArgs, rpcContract } from '../database/contract';
import type { UsersContracts } from './functions';

export const AcceptedVersions = z.object({
  terms: z.string(),
  privacy: z.string(),
  acceptedAt: z.string(),
});
export type AcceptedVersions = z.infer<typeof AcceptedVersions>;

export const AccountState = z.object({
  accepted: AcceptedVersions.nullable(),
  deletionCancelled: z.boolean(),
});
export type AccountState = z.infer<typeof AccountState>;

const Versions = z.object({ terms_version: z.string(), privacy_version: z.string() });

export const ACCOUNT_RPC = {
  accept_legal: rpcContract(Versions, z.object({ accepted_at: z.string() })),
  resume_account: rpcContract(
    Versions.partial(),
    z.object({
      accepted: Versions.extend({ accepted_at: z.string() }).nullable(),
      deletion_cancelled: z.boolean(),
    }),
  ),
  request_account_deletion: rpcContract(
    z.object({ confirm_email: z.string() }),
    z.object({ delete_after: z.string(), sessions_closed: z.number() }),
  ),
  /** The file the student downloads: saved as it comes, never read by the code. */
  export_my_data: rpcContract(NoArgs, z.record(z.string(), z.unknown())),
} satisfies UsersContracts;
