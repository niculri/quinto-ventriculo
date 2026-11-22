// The report functions' contracts, as the database writes them in snake_case.
import { describe, expect, it } from 'vitest';
import { GroupRow, REPORTS_RPC, ResolutionRow } from '../reportsRpc';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;

describe('REPORTS_RPC', () => {
  it('a report is sent with its kind, the target’s id, the category, the comment and the place', () => {
    const p = {
      kind: 'card',
      id: 'g:0',
      code: null,
      version: null,
      category: 'fact',
      comment: 'c',
      location: {},
    };
    expect(ok(REPORTS_RPC.report_content.args, { p })).toBe(true);
    expect(ok(REPORTS_RPC.report_content.args, { p: { ...p, kind: 'x' } })).toBe(false);
    expect(ok(REPORTS_RPC.report_content.returns, { id: '1', created_at: 't' })).toBe(true);
  });

  it('a resolution row and a group of reports have their dates in snake_case', () => {
    const resolution = { status: 'fixed', note: null, fixed_version: 3, resolved_at: 't' };
    expect(ok(ResolutionRow, resolution)).toBe(true);
    expect(ok(ResolutionRow, { ...resolution, fixedVersion: 3, fixed_version: undefined })).toBe(
      false,
    );
    const group = {
      kind: 'note',
      target_id: 'n',
      code: null,
      version: null,
      title: null,
      path: null,
      reporters: 2,
      first_at: 'a',
      last_at: 'b',
      resolution: null,
      reports: [],
    };
    expect(ok(GroupRow, group)).toBe(true);
    expect(ok(GroupRow, { ...group, resolution: { ...resolution, id: '9' } })).toBe(true);
    expect(ok(GroupRow, { ...group, resolution })).toBe(false);
  });

  it('the queue is three lists, and the blocked ones carry when they were blocked', () => {
    const returns = REPORTS_RPC.admin_report_queue.returns;
    expect(
      ok(returns, {
        open: [],
        resolved: [],
        blocked: [{ id: 'u', name: null, email: null, blocked_at: 't' }],
      }),
    ).toBe(true);
    expect(
      ok(returns, {
        open: [],
        resolved: [],
        blocked: [{ id: 'u', name: null, email: null, blockedAt: 't' }],
      }),
    ).toBe(false);
    expect(ok(REPORTS_RPC.my_reports.args, undefined)).toBe(true);
    expect(ok(REPORTS_RPC.my_reports.returns, [])).toBe(true);
  });

  it('resolving, reopening and blocking take their own arguments and say how many it changed', () => {
    expect(
      ok(REPORTS_RPC.admin_resolve_reports.args, {
        p: { kind: 'card', target_id: 'g:0', status: 'fixed', note: null, fixed_version: null },
      }),
    ).toBe(true);
    expect(ok(REPORTS_RPC.admin_resolve_reports.returns, { resolution_id: 'r', resolved: 2 })).toBe(
      true,
    );
    expect(ok(REPORTS_RPC.admin_reopen_reports.args, { p: { resolution_id: 'r' } })).toBe(true);
    expect(ok(REPORTS_RPC.admin_reopen_reports.returns, { reopened: 1 })).toBe(true);
    expect(
      ok(REPORTS_RPC.admin_set_report_block.args, { p: { user_id: 'u', blocked: true } }),
    ).toBe(true);
    expect(
      ok(REPORTS_RPC.admin_set_report_block.returns, {
        user_id: 'u',
        blocked: true,
        changed: false,
      }),
    ).toBe(true);
    expect(ok(REPORTS_RPC.admin_set_report_block.returns, { user_id: 'u', blocked: true })).toBe(
      false,
    );
  });
});
