// The access panel's shapes: what the database sends in snake_case and what the web reads, and the refusals of an
// invitation.
import { describe, expect, it } from 'vitest';
import { ACCESS_RPC, AccessReportRow, InviteRejection, SetAdminResult } from '../access';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;

describe('AccessReportRow', () => {
  const row = { open_to_domain: false, lists: [], invited: [], accounts_without_invite: [] };

  it('a database without the site owner’s column does not send the owner or whether it is you', () => {
    expect(ok(AccessReportRow, row)).toBe(true);
    expect(ok(AccessReportRow, { ...row, owner: null, you_are_owner: false })).toBe(true);
    expect(ok(AccessReportRow, { ...row, owner: 'a@ug.uchile.cl' })).toBe(true);
    expect(ok(AccessReportRow, { ...row, you_are_owner: 'yes' })).toBe(false);
  });

  it('an invitation says whether it is an administrator and whether it has an account, and its dates may be null', () => {
    const invite = {
      email: 'a@ug.uchile.cl',
      list: 'Medicina',
      note: null,
      invited_by: null,
      invited_at: 't',
      admin: false,
      has_account: true,
      last_sign_in_at: null,
    };
    expect(ok(AccessReportRow, { ...row, invited: [invite] })).toBe(true);
    const { has_account: _h, ...without } = invite;
    expect(ok(AccessReportRow, { ...row, invited: [without] })).toBe(false);
  });
});

describe('the functions', () => {
  it('removing invitations takes a list of emails or the name of a list', () => {
    const args = ACCESS_RPC.admin_remove_invites.args;
    expect(ok(args, { p: { emails: ['a@ug.uchile.cl'] } })).toBe(true);
    expect(ok(args, { p: { list: 'Medicina' } })).toBe(true);
    expect(ok(args, { p: {} })).toBe(false);
    expect(ok(args, { p: { emails: 'a@ug.uchile.cl' } })).toBe(false);
  });

  it('inviting needs the emails and the list, and the note is optional', () => {
    const args = ACCESS_RPC.admin_invite_emails.args;
    expect(ok(args, { p: { emails: [], list: 'L' } })).toBe(true);
    expect(ok(args, { p: { emails: [], list: 'L', note: 'n' } })).toBe(true);
    expect(ok(args, { p: { emails: [] } })).toBe(false);
  });

  it('the answer to an invitation counts and names the rejected ones with a reason that is one of four', () => {
    const returns = ACCESS_RPC.admin_invite_emails.returns;
    const base = { added: 1, already: 0, added_emails: ['a'], already_emails: [] };
    expect(ok(returns, { ...base, rejected: [{ email: 'x', reason: 'domain' }] })).toBe(true);
    expect(ok(returns, { ...base, rejected: [{ email: 'x', reason: 'other' }] })).toBe(false);
    expect(InviteRejection.options).toEqual(['domain', 'invalid', 'repeated', 'empty']);
  });

  it('making an administrator says whether anything changed', () => {
    expect(ok(SetAdminResult, { email: 'a', admin: true, changed: false })).toBe(true);
    expect(ok(SetAdminResult, { email: 'a', admin: true })).toBe(false);
    expect(ok(ACCESS_RPC.admin_access_report.args, undefined)).toBe(true);
  });
});
