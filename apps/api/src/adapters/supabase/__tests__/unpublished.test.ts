// Tests for the record of what was taken off the site, read from the content database.
import { describe, expect, it } from 'vitest';
import { failed, fakeContentClient, ok } from '../../../test/contentClient';
import { supabaseUnpublishedRepository } from '../unpublished';

const repo = (answer: ReturnType<typeof ok>) => {
  const { client, calls } = fakeContentClient({ 'rpc:unpublish_log_entries': answer });
  return { repo: supabaseUnpublishedRepository('https://c.example.co', 'k', client), calls };
};

describe('supabaseUnpublishedRepository', () => {
  it('asks for the last 200 and reads the time of each as ISO', async () => {
    const { repo: r, calls } = repo(
      ok({
        total: 1,
        entries: [
          {
            id: 1,
            doneAt: '2026-11-01T10:00:00+00:00',
            by: 'ana',
            kind: 'note',
            itemId: 'AP-BC-C2-01',
            title: 'Uno',
            reason: 'x',
            removed: {},
            onSite: null,
          },
        ],
      }),
    );
    const log = await r.log();
    expect(log.total).toBe(1);
    expect(log.entries[0]!.doneAt).toBe('2026-11-01T10:00:00.000Z');
    expect(calls[0]!.args).toEqual({ max_entries: 200 });
  });

  it('a failure says which function', async () => {
    await expect(repo(failed('caído')).repo.log()).rejects.toThrow(
      'Content database (unpublish_log_entries): caído',
    );
  });
});
