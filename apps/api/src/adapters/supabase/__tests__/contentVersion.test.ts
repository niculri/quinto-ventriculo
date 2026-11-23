// Tests for the content version of the content database: the last publication and the removals, none yet, and the errors.
import { describe, expect, it } from 'vitest';
import { failed, fakeContentClient, ok } from '../../../test/contentClient';
import { supabaseContentVersion } from '../contentVersion';

const release = (id: number, status: 'published' | 'reverted') => ({
  id,
  status,
  title: 'Biología celular · Certamen 2',
  schemaVersion: 1,
  publishedAt: '2026-11-07T12:00:00+00:00',
  publishedBy: 'dueno@ug.uchile.cl',
  revertedAt: status === 'reverted' ? '2026-11-07T12:05:00+00:00' : null,
  revertedBy: status === 'reverted' ? 'dueno@ug.uchile.cl' : null,
  changes: {},
  canRevert: status === 'published',
});

const version = (answers: Parameters<typeof fakeContentClient>[0]) => {
  const { client, calls } = fakeContentClient(answers);
  return { source: supabaseContentVersion(client), calls };
};

describe('supabaseContentVersion', () => {
  it('asks each function for one row: the last publication and how many were taken off', async () => {
    const { source, calls } = version({
      'rpc:release_log': ok({ releases: [release(12, 'published')] }),
      'rpc:unpublish_log_entries': ok({ total: 3, entries: [{ doneAt: '2026-11-08T10:00:00Z' }] }),
    });
    expect(await source.current()).toBe('r12.u3');
    expect(calls.map((c) => [c.key, c.args])).toEqual([
      ['rpc:release_log', { max_rows: 1 }],
      ['rpc:unpublish_log_entries', { max_entries: 1 }],
    ]);
  });

  it('an undone publication is another version; nothing published nor taken off yet is zero', async () => {
    const undone = version({
      'rpc:release_log': ok({ releases: [release(12, 'reverted')] }),
      'rpc:unpublish_log_entries': ok({ total: 0, entries: [] }),
    });
    expect(await undone.source.current()).toBe('r12x.u0');
    const empty = version({
      'rpc:release_log': ok({ releases: [] }),
      'rpc:unpublish_log_entries': ok({ total: 0, entries: [] }),
    });
    expect(await empty.source.current()).toBe('r0.u0');
  });

  it('a failure of either call says which function', async () => {
    const none = { 'rpc:unpublish_log_entries': ok({ total: 0, entries: [] }) };
    await expect(
      version({ ...none, 'rpc:release_log': failed('caída') }).source.current(),
    ).rejects.toThrow('Content database (release_log): caída');
    await expect(
      version({
        'rpc:release_log': ok({ releases: [] }),
        'rpc:unpublish_log_entries': failed('caída'),
      }).source.current(),
    ).rejects.toThrow('Content database (unpublish_log_entries): caída');
  });
});
