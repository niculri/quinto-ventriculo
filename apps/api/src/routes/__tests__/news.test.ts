// Tests for `GET /api/news`: the 30 minutes of wait on a fake clock, undoing a publication, the courses turned off and
// what the API answers without the announcements configured.
import { describe, expect, it } from 'vitest';
import { NewsFeed } from '@qv/schema';
import { NEWS_ADMIN, newsApp } from '../../test/newsApp';

const CHECKS = { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] };
const DRAFT = {
  kind: 'new',
  title: 'Anatomía II · Certamen 3: clases nuevas',
  body: 'Dos clases y un test.',
  items: [
    { courseId: 'anatomia-2', assessmentId: 'anatomia-2/certamen-3' },
    { courseId: 'fisica', assessmentId: 'fisica/certamen-1' },
  ],
};

const titles = async (r: Response) =>
  NewsFeed.parse(await r.json()).announcements.map((a) => [
    a.title,
    a.items.map((i) => i.courseId),
  ]);

async function published(options: Parameters<typeof newsApp>[0] = {}) {
  const site = newsApp(options);
  const r = await site.call('/api/admin/release/publish', NEWS_ADMIN, {
    fingerprint: 'f'.repeat(32),
    title: 'Anatomía II · Certamen 3',
    checks: CHECKS,
    announcement: DRAFT,
  });
  const id = (await r.json<{ id: number }>()).id;
  return { ...site, id };
}

describe('the news', () => {
  it('come out 30 minutes after publishing, not before; no-store', async () => {
    const { call, clock } = await published();
    const r = await call('/api/news');
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await titles(r)).toEqual([]);
    clock.now += 29 * 60 + 59;
    expect(await titles(await call('/api/news'))).toEqual([]);
    clock.now += 1;
    expect(await titles(await call('/api/news'))).toEqual([
      [DRAFT.title, ['anatomia-2', 'fisica']],
    ]);
  });

  it('undoing the publication takes its announcement away, before and after it came out', async () => {
    const early = await published();
    await early.call('/api/admin/release/revert', NEWS_ADMIN, { id: early.id });
    early.clock.now += 3600;
    expect(await titles(await early.call('/api/news'))).toEqual([]);

    const late = await published();
    late.clock.now += 3600;
    expect(await titles(await late.call('/api/news'))).toHaveLength(1);
    await late.call('/api/admin/release/revert', NEWS_ADMIN, { id: late.id });
    expect(await titles(await late.call('/api/news'))).toEqual([]);
  });

  it('leaves out a course turned off, for a student and for the administrator', async () => {
    const { call, clock } = await published({ hiddenCourses: ['fisica'] });
    clock.now += 3600;
    for (const who of ['ana@ug.uchile.cl', NEWS_ADMIN]) {
      expect(await titles(await call('/api/news', who))).toEqual([[DRAFT.title, ['anatomia-2']]]);
    }
  });

  it('without a session it is 401; without the announcements configured, none', async () => {
    const { app, call } = newsApp({ announcements: false });
    expect((await app.request('/api/news')).status).toBe(401);
    expect(await titles(await call('/api/news'))).toEqual([]);
  });
});
