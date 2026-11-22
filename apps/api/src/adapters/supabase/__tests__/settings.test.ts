// Tests for the site settings of the content database: the time as ISO, the old database without courses, the errors.
import { describe, expect, it } from 'vitest';
import { failed, fakeContentClient, ok } from '../../../test/contentClient';
import { supabaseSiteSettingsRepository } from '../settings';

const repo = (answers: Parameters<typeof fakeContentClient>[0]) => {
  const { client, calls } = fakeContentClient(answers);
  return { repo: supabaseSiteSettingsRepository('https://c.example.co', 'k', client), calls };
};

describe('supabaseSiteSettingsRepository', () => {
  it('reads the time of the last change as ISO, and none as null', async () => {
    const row = { hideEmptySemesters: true, hiddenCourses: ['a'], updatedBy: 'ana' };
    const changed = repo({
      'rpc:site_settings': ok({ ...row, updatedAt: '2026-11-01T10:00:00+00:00' }),
    });
    expect(await changed.repo.get()).toMatchObject({ updatedAt: '2026-11-01T10:00:00.000Z' });
    const never = repo({ 'rpc:site_settings': ok({ ...row, updatedAt: null }) });
    expect(await never.repo.get()).toMatchObject({ updatedAt: null });
  });

  it('a database before the switch for courses sends none, and none are hidden', async () => {
    const { repo: r } = repo({
      'rpc:site_settings': ok({ hideEmptySemesters: false, updatedAt: null, updatedBy: null }),
    });
    expect(await r.get()).toMatchObject({ hiddenCourses: [] });
  });

  it('set sends the change as its argument p and reads what the database answers', async () => {
    const { repo: r, calls } = repo({
      'rpc:set_site_settings': ok({
        hideEmptySemesters: true,
        hiddenCourses: [],
        updatedAt: '2026-11-01T10:00:00+00:00',
        updatedBy: 'ana',
      }),
    });
    expect(await r.set({ by: 'ana', hideEmptySemesters: true })).toMatchObject({
      hideEmptySemesters: true,
      updatedBy: 'ana',
    });
    expect(calls[0]!.args).toEqual({ p: { by: 'ana', hideEmptySemesters: true } });
  });

  it('a failure of either call says which function', async () => {
    const { repo: r } = repo({
      'rpc:site_settings': failed('caído'),
      'rpc:set_site_settings': failed('sin permiso'),
    });
    await expect(r.get()).rejects.toThrow('Content database (site_settings): caído');
    await expect(r.set({ by: 'ana' })).rejects.toThrow(
      'Content database (set_site_settings): sin permiso',
    );
  });
});
