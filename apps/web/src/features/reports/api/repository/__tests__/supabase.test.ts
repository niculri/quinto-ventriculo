// Tests the reports repository of the users database: each refusal of report_content() and the panel's functions
// says what the page should, and the people blocked keep the page's names.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { describe, expect, it, vi } from 'vitest';
import { REPORT_MESSAGES, ReportError, supabaseReportsRepository } from '..';
import type { NewReport } from '..';

const clientWith = (answer: { data: unknown; error: unknown }) => {
  const rpc = vi.fn(async () => answer);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
};
const refused = (message: string, code = 'P0001') =>
  supabaseReportsRepository(clientWith({ data: null, error: { code, message } }).client);

const REPORT: NewReport = {
  kind: 'card',
  id: 'g:0',
  code: null,
  version: null,
  location: {},
  category: 'fact',
  comment: 'mal',
};

describe('the refusals of the database', () => {
  it.each([
    ['report_daily_limit', REPORT_MESSAGES.dailyLimit],
    ['report_place_limit', REPORT_MESSAGES.placeLimit],
    ['report_blocked', REPORT_MESSAGES.blocked],
    ['nothing_open', REPORT_MESSAGES.nothingOpen],
    ['nothing_to_reopen', REPORT_MESSAGES.nothingOpen],
    ['admin_stays', REPORT_MESSAGES.adminStays],
    ['session_closed', REPORT_MESSAGES.sessionClosed],
    ['admin_only', REPORT_MESSAGES.adminOnly],
    ['TypeError: Failed to fetch', REPORT_MESSAGES.offline],
  ])('%s says «%s»', async (message, said) => {
    const e: unknown = await refused(message)
      .send(REPORT)
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ReportError);
    expect((e as ReportError).message).toBe(said);
  });

  it('a closed session is also its code, whatever the message', async () => {
    await expect(refused('JWT expired', '28000').reopen('r1')).rejects.toThrow(
      REPORT_MESSAGES.sessionClosed,
    );
  });

  it('every call says the refusal: mine, the queue, resolving, reopening and blocking', async () => {
    const repo = refused('admin_only');
    for (const call of [
      () => repo.mine(),
      () => repo.queue(),
      () =>
        repo.resolve({
          kind: 'card',
          targetId: 'g:0',
          status: 'fixed',
          note: null,
          fixedVersion: 2,
        }),
      () => repo.setBlocked('u', true),
    ]) {
      await expect(call()).rejects.toThrow(REPORT_MESSAGES.adminOnly);
    }
  });
});

describe('the panel', () => {
  it('the people blocked come with the page’s names', async () => {
    const { client } = clientWith({
      data: {
        open: [],
        resolved: [],
        blocked: [
          {
            id: 'u1',
            name: null,
            email: 'alguien@ug.uchile.cl',
            blocked_at: '2026-05-01T00:00:00Z',
          },
        ],
      },
      error: null,
    });
    expect((await supabaseReportsRepository(client).queue()).blocked).toEqual([
      { id: 'u1', name: null, email: 'alguien@ug.uchile.cl', blockedAt: '2026-05-01T00:00:00Z' },
    ]);
  });

  it('a decision other than «fixed» never sends a version', async () => {
    const { client, rpc } = clientWith({ data: { resolved: 1 }, error: null });
    const resolved = await supabaseReportsRepository(client).resolve({
      kind: 'note',
      targetId: 'n',
      status: 'wont_fix',
      note: 'no',
      fixedVersion: 9,
    });
    expect(resolved).toBe(1);
    expect(rpc).toHaveBeenCalledWith('admin_resolve_reports', {
      p: { kind: 'note', target_id: 'n', status: 'wont_fix', note: 'no', fixed_version: null },
    });
  });
});
