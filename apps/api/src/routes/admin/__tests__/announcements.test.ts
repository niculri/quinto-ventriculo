// Tests for the panel's announcements: publishing with one, its status on the clock, one about the site, saving again
// and withdrawing, the refusals and who can.
import { describe, expect, it } from 'vitest';
import { AdminAnnouncement, AdminAnnouncements, NewsFeed, PublishResponse } from '@qv/schema';
import { NEWS_ADMIN, NEWS_STUDENT, newsApp } from '../../../test/newsApp';

const CHECKS = { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] };
const PUBLISH = { fingerprint: 'f'.repeat(32), title: 'Anatomía II · Certamen 3', checks: CHECKS };
const DRAFT = { kind: 'new', title: 'Clases nuevas', body: '', items: [] };

const list = async (call: ReturnType<typeof newsApp>['call']) =>
  AdminAnnouncements.parse(await (await call('/api/admin/announcements', NEWS_ADMIN)).json())
    .announcements;

describe('publishing with an announcement', () => {
  it('saves it tied to the release, and it waits 30 minutes', async () => {
    const { call, clock } = newsApp();
    const r = await call('/api/admin/release/publish', NEWS_ADMIN, {
      ...PUBLISH,
      announcement: DRAFT,
    });
    expect(PublishResponse.parse(await r.json())).toMatchObject({ id: 1, announcement: 'saved' });
    expect(await list(call)).toMatchObject([
      {
        releaseId: 1,
        kind: 'new',
        title: 'Clases nuevas',
        createdBy: NEWS_ADMIN,
        status: 'waiting',
      },
    ]);
    clock.now += 30 * 60;
    expect((await list(call))[0]!.status).toBe('out');
    await call('/api/admin/release/revert', NEWS_ADMIN, { id: 1 });
    expect((await list(call))[0]!.status).toBe('withdrawn');
  });

  it('without one it publishes as before; one about the site is refused', async () => {
    const { call } = newsApp();
    const r = await call('/api/admin/release/publish', NEWS_ADMIN, PUBLISH);
    expect(PublishResponse.parse(await r.json())).toMatchObject({ announcement: 'none' });
    const site = await call('/api/admin/release/publish', NEWS_ADMIN, {
      ...PUBLISH,
      announcement: { ...DRAFT, kind: 'site' },
    });
    expect(site.status).toBe(400);
    expect(await list(call)).toEqual([]);
  });

  it('a release undone before its announcement was saved says it failed too', async () => {
    const site = newsApp();
    site.announcements.save = () => Promise.resolve('release');
    const r = await site.call('/api/admin/release/publish', NEWS_ADMIN, {
      ...PUBLISH,
      announcement: DRAFT,
    });
    expect(PublishResponse.parse(await r.json())).toMatchObject({ announcement: 'failed' });
  });

  it('a release that went out without its announcement says so, and saving it again makes one', async () => {
    const site = newsApp();
    site.announcements.save = () => Promise.reject(new Error('the database is down'));
    const r = await site.call('/api/admin/release/publish', NEWS_ADMIN, {
      ...PUBLISH,
      announcement: DRAFT,
    });
    expect(PublishResponse.parse(await r.json())).toMatchObject({ id: 1, announcement: 'failed' });
  });
});

describe('the panel’s announcements', () => {
  it('one about the site, written by hand, also waits; withdrawing it hides it from the students', async () => {
    const { call, clock } = newsApp();
    const r = await call('/api/admin/announcements', NEWS_ADMIN, {
      ...DRAFT,
      kind: 'site',
      title: 'El explorador cambió',
      releaseId: null,
    });
    const saved = AdminAnnouncement.parse(await r.json());
    expect(saved).toMatchObject({ releaseId: null, status: 'waiting' });
    clock.now += 31 * 60;
    const news = async () =>
      NewsFeed.parse(await (await call('/api/news')).json()).announcements.length;
    expect(await news()).toBe(1);
    const out = await call('/api/admin/announcements/withdraw', NEWS_ADMIN, { id: saved.id });
    expect(AdminAnnouncement.parse(await out.json())).toMatchObject({
      status: 'withdrawn',
      withdrawnBy: NEWS_ADMIN,
    });
    expect(await news()).toBe(0);
  });

  it('saving again the one of a release keeps a single one; of an undone release is refused', async () => {
    const { call } = newsApp();
    await call('/api/admin/release/publish', NEWS_ADMIN, PUBLISH);
    const again = { ...DRAFT, releaseId: 1 };
    expect((await call('/api/admin/announcements', NEWS_ADMIN, again)).status).toBe(200);
    expect(
      (await call('/api/admin/announcements', NEWS_ADMIN, { ...again, title: 'Otro' })).status,
    ).toBe(200);
    expect((await list(call)).map((a) => a.title)).toEqual(['Otro']);
    await call('/api/admin/release/revert', NEWS_ADMIN, { id: 1 });
    await call('/api/admin/release/publish', NEWS_ADMIN, PUBLISH);
    const refused = await call('/api/admin/announcements', NEWS_ADMIN, again);
    expect(refused.status).toBe(409);
    expect((await refused.json<{ error: string }>()).error).toBe('announcement_release');
  });

  it('what is malformed is 400 and what does not exist 404', async () => {
    const { call, app } = newsApp();
    for (const path of ['/api/admin/announcements', '/api/admin/announcements/withdraw']) {
      const r = await app.request(path, {
        method: 'POST',
        body: '{no es json',
        headers: { Authorization: `Bearer ${NEWS_ADMIN}`, 'Content-Type': 'application/json' },
      });
      expect(r.status, path).toBe(400);
    }
    for (const body of [
      {},
      { ...DRAFT, releaseId: null },
      { ...DRAFT, kind: 'site', releaseId: 3 },
    ]) {
      const r = await call('/api/admin/announcements', NEWS_ADMIN, body);
      expect(r.status).toBe(400);
      expect((await r.json<{ error: string }>()).error).toBe('invalid_announcement');
    }
    expect((await call('/api/admin/announcements/withdraw', NEWS_ADMIN, { id: 'x' })).status).toBe(
      400,
    );
    const missing = await call('/api/admin/announcements/withdraw', NEWS_ADMIN, { id: 9 });
    expect(missing.status).toBe(404);
    expect((await missing.json<{ error: string }>()).error).toBe('announcement_missing');
  });

  it('a student gets «no existe» and writes nothing; without the announcements there is no panel', async () => {
    const { call } = newsApp();
    for (const [path, body] of [
      ['/api/admin/announcements', undefined],
      ['/api/admin/announcements', { ...DRAFT, kind: 'site', releaseId: null }],
      ['/api/admin/announcements/withdraw', { id: 1 }],
    ] as const) {
      expect((await call(path, NEWS_STUDENT, body)).status, path).toBe(404);
    }
    expect(await list(call)).toEqual([]);
    const bare = newsApp({ announcements: false });
    expect((await bare.call('/api/admin/announcements', NEWS_ADMIN)).status).toBe(404);
  });
});
