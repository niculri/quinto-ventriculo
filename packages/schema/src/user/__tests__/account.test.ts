// The account's shapes: the legal versions accepted and what entering the site reports.
import { describe, expect, it } from 'vitest';
import { ACCOUNT_RPC, AccountState } from '../account';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;

describe('the account', () => {
  it('accepting the legal texts needs both versions, but resuming the account asks for none or either', () => {
    expect(ok(ACCOUNT_RPC.accept_legal.args, { terms_version: '1', privacy_version: '1' })).toBe(
      true,
    );
    expect(ok(ACCOUNT_RPC.accept_legal.args, { terms_version: '1' })).toBe(false);
    for (const args of [
      {},
      { terms_version: '2' },
      { privacy_version: '2' },
      { terms_version: '2', privacy_version: '2' },
    ]) {
      expect(ok(ACCOUNT_RPC.resume_account.args, args)).toBe(true);
    }
    expect(ok(ACCOUNT_RPC.resume_account.args, { terms_version: 2 })).toBe(false);
  });

  it('resuming says what was accepted (or nothing, for somebody who never did) and whether a deletion was cancelled', () => {
    const returns = ACCOUNT_RPC.resume_account.returns;
    expect(ok(returns, { accepted: null, deletion_cancelled: false })).toBe(true);
    expect(
      ok(returns, {
        accepted: { terms_version: '1', privacy_version: '1', accepted_at: 't' },
        deletion_cancelled: true,
      }),
    ).toBe(true);
    expect(
      ok(returns, {
        accepted: { terms_version: '1', privacy_version: '1' },
        deletion_cancelled: true,
      }),
    ).toBe(false);
    expect(ok(returns, { accepted: null })).toBe(false);
  });

  it('deleting the account needs the email typed again, and says when it will go', () => {
    expect(ok(ACCOUNT_RPC.request_account_deletion.args, { confirm_email: 'a@ug.uchile.cl' })).toBe(
      true,
    );
    expect(ok(ACCOUNT_RPC.request_account_deletion.args, {})).toBe(false);
    expect(
      ok(ACCOUNT_RPC.request_account_deletion.returns, { delete_after: 't', sessions_closed: 2 }),
    ).toBe(true);
  });

  it('the export is whatever object the database gives, never read by the code', () => {
    expect(ok(ACCOUNT_RPC.export_my_data.returns, { anything: [1, { b: 2 }] })).toBe(true);
    expect(ok(ACCOUNT_RPC.export_my_data.returns, [])).toBe(false);
    expect(ok(ACCOUNT_RPC.export_my_data.args, undefined)).toBe(true);
  });

  it('the state on entering has an accepted record or null', () => {
    expect(ok(AccountState, { accepted: null, deletionCancelled: false })).toBe(true);
    expect(
      ok(AccountState, {
        accepted: { terms: 'a', privacy: 'b', acceptedAt: 't' },
        deletionCancelled: false,
      }),
    ).toBe(true);
    expect(ok(AccountState, { deletionCancelled: false })).toBe(false);
  });
});
