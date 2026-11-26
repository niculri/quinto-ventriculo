// Tests for the announcements of the content database: times as ISO, the refusals, a database without the migration
// and the errors that name their function.
import { describe, expect, it } from 'vitest';
import { failed, fakeContentClient, ok } from '../../../test/contentClient';
import { supabaseAnnouncementRepository } from '../announcements';

const repo = (answers: Parameters<typeof fakeContentClient>[0]) => {
  const { client, calls } = fakeContentClient(answers);
  return { repo: supabaseAnnouncementRepository('https://c.example.co', 'k', client), calls };
};

const ROW = {
  id: 3,
  releaseId: 7,
  releaseTitle: 'A · Certamen 1',
  releaseStatus: 'published',
  kind: 'new',
  title: 'Clases nuevas',
  body: '',
  items: [{ courseId: 'a', assessmentId: 'a/certamen-1' }],
  createdAt: '2026-11-25T12:00:00.123456+00:00',
  createdBy: 'dueno@ug.uchile.cl',
  publishAt: '2026-11-25T12:30:00.123456+00:00',
  withdrawnAt: null,
  withdrawnBy: null,
};

describe('supabaseAnnouncementRepository', () => {
  it('reads the feed at the time it is given, with the times as ISO', async () => {
    const { repo: r, calls } = repo({
      'rpc:announcements_feed': ok([
        { id: 3, kind: 'new', title: 'T', body: '', items: [], publishedAt: ROW.publishAt },
      ]),
    });
    expect(await r.feed('2026-11-25T13:00:00.000Z', 100)).toEqual([
      {
        id: 3,
        kind: 'new',
        title: 'T',
        body: '',
        items: [],
        publishedAt: '2026-11-25T12:30:00.123Z',
      },
    ]);
    expect(calls[0]!.args).toEqual({ at: '2026-11-25T13:00:00.000Z', max_rows: 100 });
  });

  it('a database without the migration gives no news; another failure says which function', async () => {
    const before = repo({
      'rpc:announcements_feed': failed('Could not find the function', 'PGRST202'),
    });
    expect(await before.repo.feed('2026-11-25T13:00:00.000Z', 10)).toEqual([]);
    const down = repo({
      'rpc:announcements_feed': failed('caído'),
      'rpc:admin_announcements': failed('caído'),
      'rpc:save_announcement': failed('caído'),
      'rpc:withdraw_announcement': failed('caído'),
    });
    await expect(down.repo.feed('x', 1)).rejects.toThrow(
      'Content database (announcements_feed): caído',
    );
    await expect(down.repo.list()).rejects.toThrow('(admin_announcements)');
    await expect(
      down.repo.save({ kind: 'site', title: 't', body: '', items: [], releaseId: null, by: 'x' }),
    ).rejects.toThrow('(save_announcement)');
    await expect(down.repo.withdraw(1, 'x')).rejects.toThrow('(withdraw_announcement)');
  });

  it('the panel’s list, saving and withdrawing, with the times as ISO', async () => {
    const withdrawn = { ...ROW, withdrawnAt: '2026-11-25T12:10:00+00:00', withdrawnBy: 'x' };
    const { repo: r, calls } = repo({
      'rpc:admin_announcements': ok([ROW]),
      'rpc:save_announcement': ok(ROW),
      'rpc:withdraw_announcement': ok(withdrawn),
    });
    expect((await r.list())[0]).toMatchObject({
      createdAt: '2026-11-25T12:00:00.123Z',
      publishAt: '2026-11-25T12:30:00.123Z',
    });
    const input = { kind: 'new' as const, title: 'T', body: '', items: [], releaseId: 7 };
    expect(await r.save({ ...input, by: 'dueno@ug.uchile.cl' })).toMatchObject({ id: 3 });
    expect(calls[1]!.args).toEqual({ p: { ...input, by: 'dueno@ug.uchile.cl' } });
    expect(await r.withdraw(3, 'x')).toMatchObject({ withdrawnAt: '2026-11-25T12:10:00.000Z' });
    expect(calls[2]!.args).toEqual({ p: { id: 3, by: 'x' } });
  });

  it('a release that is not published, or an announcement that does not exist, is a refusal', async () => {
    const { repo: r } = repo({
      'rpc:save_announcement': failed('save_announcement: release', 'P0422'),
      'rpc:withdraw_announcement': failed('withdraw_announcement: missing', 'P0422'),
    });
    const input = { kind: 'new' as const, title: 'T', body: '', items: [], releaseId: 7, by: 'x' };
    expect(await r.save(input)).toBe('release');
    expect(await r.withdraw(9, 'x')).toBe('missing');
  });
});
