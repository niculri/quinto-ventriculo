// Tests for the administrators' switch that hides the semesters without material from the catalog.
import { describe, expect, it } from 'vitest';
import { Catalog, PREVIEW_HEADER, SiteSettings, SiteSettingsView } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { createApp } from '../../../app';
import { MediaSigner } from '../../../services/media-signer';
import { memoryRepository } from '../../../adapters/memory/content';
import { memorySiteSettings } from '../../../adapters/memory/settings';
import type { SiteSettingsRepository } from '../../../ports/settings';

const ADMIN = 'dueno@ug.uchile.cl';
const STUDENT = 'ana@ug.uchile.cl';

const bundle = (withDraftArticle = false): ContentBundle => ({
  semesters: [
    { number: 1, name: '1° Semestre' },
    { number: 2, name: '2° Semestre' },
    { number: 3, name: '3° Semestre' },
  ],
  courses: [
    { id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 },
    { id: 'fisica', semester: 2, name: 'Física', emoji: '🧲', position: 1 },
  ],
  assessments: [
    { id: 'anatomia-1/certamen-1', courseId: 'anatomia-1', name: 'Certamen 1', position: 1 },
    { id: 'fisica/certamen-1', courseId: 'fisica', name: 'Certamen 1', position: 1 },
  ],
  notes: [
    note('AP-A1-S3-01', 'anatomia-1', 'anatomia-1/certamen-1'),
    ...(withDraftArticle ? [note('AP-FI-C1-01', 'fisica', 'fisica/certamen-1')] : []),
  ],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
});

function note(id: string, courseId: string, assessmentId: string) {
  return {
    id,
    slug: id.toLowerCase(),
    courseId,
    assessmentId,
    kind: 'lecture' as const,
    title: id,
    position: 1,
    updatedAt: '2026-11-07T12:00:00.000Z',
    sources: [],
    html: '<p>x</p>',
    toc: [],
    sections: [],
    hash: id,
    media: [],
  };
}

function appWith(settings?: SiteSettingsRepository) {
  return createApp({
    verifier: { verify: async (token) => ({ id: token, email: token }) },
    repository: memoryRepository(bundle()),
    preview: memoryRepository(bundle(true)),
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    admins: { isAdmin: async (token) => token === ADMIN },
    ...(settings ? { settings } : {}),
  });
}

const get = (app: ReturnType<typeof createApp>, path: string, who: string, headers = {}) =>
  app.request(path, { headers: { Authorization: `Bearer ${who}`, ...headers } });
const put = (app: ReturnType<typeof createApp>, who: string, body: unknown) =>
  app.request('/api/admin/site-settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${who}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const semesters = async (r: Response) => {
  const c = Catalog.parse(await r.json());
  return { numbers: c.semesters.map((s) => s.number), hidden: c.hiddenSemesters };
};

describe('hiding the semesters without material', () => {
  it('off: every semester, as before', async () => {
    const app = appWith(memorySiteSettings());
    expect(await semesters(await get(app, '/api/catalog', STUDENT))).toEqual({
      numbers: [1, 2, 3],
      hidden: undefined,
    });
  });

  it('the administrator turns it on and off; everybody sees it at once, with how many went', async () => {
    const app = appWith(memorySiteSettings());
    const on = await put(app, ADMIN, { hideEmptySemesters: true });
    expect(on.status).toBe(200);
    expect(on.headers.get('Cache-Control')).toBe('no-store');
    expect(SiteSettings.parse(await on.json())).toMatchObject({
      hideEmptySemesters: true,
      updatedBy: ADMIN,
    });
    for (const who of [STUDENT, ADMIN]) {
      expect(await semesters(await get(app, '/api/catalog', who))).toEqual({
        numbers: [1],
        hidden: 2,
      });
    }
    // In the admin mode the empty semesters are all there, marked (see admin-mode-contract.test.ts).
    expect(
      await semesters(await get(app, '/api/catalog', ADMIN, { [PREVIEW_HEADER]: 'draft' })),
    ).toEqual({ numbers: [1, 2, 3], hidden: undefined });
    expect((await get(app, '/api/admin/site-settings', ADMIN)).status).toBe(200);
    await put(app, ADMIN, { hideEmptySemesters: false });
    expect(await semesters(await get(app, '/api/catalog', STUDENT))).toEqual({
      numbers: [1, 2, 3],
      hidden: undefined,
    });
  });

  it('a student can neither read nor change it: «no existe», never kept', async () => {
    const settings = memorySiteSettings();
    const app = appWith(settings);
    for (const r of [
      await get(app, '/api/admin/site-settings', STUDENT),
      await put(app, STUDENT, { hideEmptySemesters: true }),
    ]) {
      expect(r.status).toBe(404);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
    }
    expect((await settings.get()).hideEmptySemesters).toBe(false);
    expect((await put(app, 'x', { hideEmptySemesters: true })).status).toBe(404);
    const anonymous = await app.request('/api/admin/site-settings');
    expect(anonymous.status).toBe(401);
  });

  it('refuses another body', async () => {
    const app = appWith(memorySiteSettings());
    for (const body of [{}, { hideEmptySemesters: 'yes' }, { hideEmptySemesters: true, by: 'x' }]) {
      const r = await put(app, ADMIN, body);
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ error: 'invalid_settings' });
    }
  });

  it('without settings nothing is hidden (and the panel has no switch)', async () => {
    expect(await semesters(await get(appWith(), '/api/catalog', STUDENT))).toMatchObject({
      numbers: [1, 2, 3],
    });
    expect((await get(appWith(), '/api/admin/site-settings', ADMIN)).status).toBe(404);
  });

  it('if they cannot be read, the material is not given: a course turned off could show', async () => {
    const broken: SiteSettingsRepository = {
      get: async () => {
        throw new Error('function public.site_settings() does not exist');
      },
      set: async () => {
        throw new Error('no');
      },
    };
    const errors = console.error;
    console.error = () => {};
    try {
      const r = await get(appWith(broken), '/api/catalog', STUDENT);
      expect(r.status).toBe(503);
      expect(await r.json()).toMatchObject({ error: 'settings_unavailable' });
    } finally {
      console.error = errors;
    }
  });
});

describe('turning off courses', () => {
  const courses = async (app: ReturnType<typeof createApp>, who = STUDENT) =>
    Catalog.parse(await (await get(app, '/api/catalog', who)).json()).semesters.flatMap((s) =>
      s.courses.map((c) => c.id),
    );

  it('the panel lists the courses with material by semester, and changing the list shows at once to everybody', async () => {
    const app = appWith(memorySiteSettings());
    const view = SiteSettingsView.parse(
      await (await get(app, '/api/admin/site-settings', ADMIN)).json(),
    );
    expect(view.semesters).toEqual([
      {
        number: 1,
        name: '1° Semestre',
        courses: [
          { id: 'anatomia-1', name: 'Anatomía I', emoji: '🦴', notes: 1, quizzes: 0, cards: 0 },
        ],
      },
    ]);
    expect(await courses(app)).toEqual(['anatomia-1', 'fisica']);
    const off = await put(app, ADMIN, { hiddenCourses: ['anatomia-1'] });
    expect(off.status).toBe(200);
    expect(SiteSettings.parse(await off.json())).toMatchObject({
      hiddenCourses: ['anatomia-1'],
      hideEmptySemesters: false,
      updatedBy: ADMIN,
    });
    expect(await courses(app)).toEqual(['fisica']);
    expect(await courses(app, ADMIN)).toEqual(['fisica']);
    const listed = SiteSettingsView.parse(
      await (await get(app, '/api/admin/site-settings', ADMIN)).json(),
    );
    expect(listed.hiddenCourses).toEqual(['anatomia-1']);
    expect(listed.semesters[0]!.courses.map((c) => c.id)).toEqual(['anatomia-1']);
    await put(app, ADMIN, { hiddenCourses: [] });
    expect(await courses(app)).toEqual(['anatomia-1', 'fisica']);
  });

  it('changing one setting leaves the other as it was', async () => {
    const app = appWith(memorySiteSettings());
    await put(app, ADMIN, { hiddenCourses: ['fisica'] });
    await put(app, ADMIN, { hideEmptySemesters: true });
    const kept = SiteSettings.parse(
      await (await get(app, '/api/admin/site-settings', ADMIN)).json(),
    );
    expect(kept).toMatchObject({ hideEmptySemesters: true, hiddenCourses: ['fisica'] });
  });

  it('keeps a course that is off even when it left the catalog, and refuses one that was never there', async () => {
    const settings = memorySiteSettings({ hiddenCourses: ['ya-no-esta'] });
    const app = appWith(settings);
    expect((await put(app, ADMIN, { hiddenCourses: ['ya-no-esta', 'fisica'] })).status).toBe(200);
    expect((await settings.get()).hiddenCourses).toEqual(['fisica', 'ya-no-esta']);
    expect((await put(app, ADMIN, { hiddenCourses: ['fisica', 'nunca-estuvo'] })).status).toBe(400);
    expect((await put(app, ADMIN, { hiddenCourses: ['fisica'] })).status).toBe(200);
    expect((await settings.get()).hiddenCourses).toEqual(['fisica']);
    expect((await put(app, ADMIN, { hiddenCourses: ['ya-no-esta'] })).status).toBe(400);
  });

  it('refuses a course that does not exist, and a student cannot change it', async () => {
    const settings = memorySiteSettings();
    const app = appWith(settings);
    const r = await put(app, ADMIN, { hiddenCourses: ['no-existe'] });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: 'invalid_settings' });
    expect((await put(app, STUDENT, { hiddenCourses: ['fisica'] })).status).toBe(404);
    expect((await settings.get()).hiddenCourses).toEqual([]);
  });
});
