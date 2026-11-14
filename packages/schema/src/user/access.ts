// Zod schemas of the site's access as the admin panel shows it: invitations, administrators and the account owner.
import { z } from 'zod';
import { NoArgs, rpcContract } from '../database/contract';
import type { UsersContracts } from './functions';

export const AccessInvite = z.object({
  email: z.string(),
  list: z.string(),
  note: z.string().nullable(),
  invitedBy: z.string().nullable(),
  invitedAt: z.string(),
  admin: z.boolean(),
  hasAccount: z.boolean(),
  lastSignInAt: z.string().nullable(),
});
export type AccessInvite = z.infer<typeof AccessInvite>;

export const AccessReport = z.object({
  /** Only read here: removing an invitation does not take away access. */
  openToDomain: z.boolean(),
  lists: z.array(z.object({ list: z.string(), invited: z.number(), withAccount: z.number() })),
  invited: z.array(AccessInvite),
  accountsWithoutInvite: z.array(
    z.object({ email: z.string(), createdAt: z.string(), lastSignInAt: z.string().nullable() }),
  ),
  /** Never removed as an administrator; null until the row is marked. */
  owner: z.string().nullable(),
  youAreOwner: z.boolean(),
});
export type AccessReport = z.infer<typeof AccessReport>;

/** `changed` is false when it already was as asked. */
export const SetAdminResult = z.object({
  email: z.string(),
  admin: z.boolean(),
  changed: z.boolean(),
});
export type SetAdminResult = z.infer<typeof SetAdminResult>;

export const InviteRejection = z.enum(['domain', 'invalid', 'repeated', 'empty']);
export type InviteRejection = z.infer<typeof InviteRejection>;

export const RejectedInvite = z.object({ email: z.string(), reason: InviteRejection });

export const InviteResult = z.object({
  added: z.array(z.string()),
  already: z.array(z.string()),
  rejected: z.array(RejectedInvite),
});
export type InviteResult = z.infer<typeof InviteResult>;

export const RemoveResult = z.object({
  removed: z.array(z.string()),
  notInvited: z.array(z.string()),
  keptAdmins: z.array(z.string()),
  sessionsClosed: z.number(),
  openToDomain: z.boolean(),
});
export type RemoveResult = z.infer<typeof RemoveResult>;

/** `access_report()` and what `admin_access_report()` adds; a database without the site owner's column lacks those two. */
export const AccessReportRow = z.object({
  open_to_domain: z.boolean(),
  lists: z.array(z.object({ list: z.string(), invited: z.number(), with_account: z.number() })),
  invited: z.array(
    z.object({
      email: z.string(),
      list: z.string(),
      note: z.string().nullable(),
      invited_by: z.string().nullable(),
      invited_at: z.string(),
      admin: z.boolean(),
      has_account: z.boolean(),
      last_sign_in_at: z.string().nullable(),
    }),
  ),
  accounts_without_invite: z.array(
    z.object({
      email: z.string(),
      created_at: z.string(),
      last_sign_in_at: z.string().nullable(),
    }),
  ),
  owner: z.string().nullable().optional(),
  you_are_owner: z.boolean().optional(),
});
export type AccessReportRow = z.infer<typeof AccessReportRow>;

const Emails = z.array(z.string());

export const ACCESS_RPC = {
  admin_access_report: rpcContract(NoArgs, AccessReportRow),
  admin_invite_emails: rpcContract(
    z.object({ p: z.object({ emails: Emails, list: z.string(), note: z.string().optional() }) }),
    z.object({
      added: z.number(),
      already: z.number(),
      rejected: z.array(RejectedInvite),
      added_emails: Emails,
      already_emails: Emails,
    }),
  ),
  admin_remove_invites: rpcContract(
    z.object({ p: z.union([z.object({ emails: Emails }), z.object({ list: z.string() })]) }),
    z.object({
      removed: Emails,
      not_invited: Emails,
      kept_admins: Emails,
      sessions_closed: z.number(),
      open_to_domain: z.boolean(),
    }),
  ),
  admin_set_admin: rpcContract(
    z.object({ p: z.object({ email: z.string(), admin: z.boolean() }) }),
    SetAdminResult,
  ),
} satisfies UsersContracts;
