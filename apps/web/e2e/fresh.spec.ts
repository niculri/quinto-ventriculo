// E2e test of what is published showing on the next click, without reloading (a 304 while nothing changed), also
// after undoing in the panel. On a server of its own: publishing changes what everybody on it reads.
import { expect, test } from './test';
import type { APIRequestContext, Page } from '@playwright/test';
import { FRESH_PORT, demoState } from './accepted';
import { signIn } from './helpers';

const BASE = `http://localhost:${FRESH_PORT}`;
const AUTH = { Authorization: 'Bearer demo-local' };
const NOTES = '/semesters/2/courses/biologia-celular/assessments/certamen-2/notes';
const NEW_NOTE = 'Regulación (solo en el borrador)';
const PUBLISHED_TEXT = 'Los ribosomas tienen dos subunidades.';
const DRAFT_TEXT = 'una mayor y una menor';

test.use({ baseURL: BASE, storageState: demoState(FRESH_PORT) });
test.describe.configure({ mode: 'serial' });

/** A bit more than what the web waits before checking again what it read (RECHECK_AFTER_MS). */
const RECHECK = 16_000;

/** A retry, or a server left running, may find the last run's publication: the site goes back to what was published. */
async function backToStart(request: APIRequestContext) {
  const log = (await (await request.get('/api/admin/releases', { headers: AUTH })).json()) as {
    releases: { id: number; status: string }[];
  };
  const last = log.releases[0];
  if (last?.status !== 'published') return;
  const undone = await request.post('/api/admin/release/revert', {
    headers: AUTH,
    data: { id: last.id },
  });
  expect(undone.ok()).toBe(true);
}

/** A mark that a reload would erase. */
const markPage = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { notReloaded_: boolean }).notReloaded_ = true;
  });
const notReloaded = (page: Page) =>
  page.evaluate(() => (window as unknown as { notReloaded_?: boolean }).notReloaded_ === true);

async function publishFromAnotherSession(request: APIRequestContext) {
  const overview = (await (await request.get('/api/admin/release', { headers: AUTH })).json()) as {
    summary: { fingerprint: string };
  };
  const { fingerprint } = overview.summary;
  for (const mark of ['phone', 'answers']) {
    const marked = await request.put('/api/admin/release/marks', {
      headers: AUTH,
      data: { fingerprint, mark, checked: true },
    });
    expect(marked.ok()).toBe(true);
  }
  const published = await request.post('/api/admin/release/publish', {
    headers: AUTH,
    data: {
      fingerprint,
      title: 'Biología celular · Certamen 2',
      checks: { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] },
    },
  });
  expect(published.ok()).toBe(true);
}

test('another session publishes: the next click shows it, and undoing in the panel too, never reloading', async ({
  page,
  playwright,
}) => {
  const other = await playwright.request.newContext({ baseURL: BASE });
  await backToStart(other);
  const catalog: number[] = [];
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === '/api/catalog') catalog.push(r.status());
  });
  await signIn(page);
  await page.goto(NOTES);
  const main = page.getByRole('main');
  const route = page.getByRole('navigation', { name: 'Ruta' });
  await expect(main.getByRole('link', { name: /^Clase 11 Traducción/ })).toBeVisible();
  await expect(main.getByText(NEW_NOTE)).toHaveCount(0);
  await markPage(page);

  // Nothing published yet: going to the note checks the catalog again, and the API says it did not change.
  await page.clock.fastForward(RECHECK);
  await main.getByRole('link', { name: /^Clase 11 Traducción/ }).click();
  await expect(main.getByText(PUBLISHED_TEXT)).toBeVisible();
  await expect.poll(() => catalog.includes(304)).toBe(true);
  await route.getByRole('link', { name: 'Apuntes' }).click();
  await expect(main.getByRole('link', { name: /^Clase 11 Traducción/ })).toBeVisible();
  await expect(main.getByText(NEW_NOTE)).toHaveCount(0);

  // Another session publishes the draft: a new note and a sentence changed in the one already read.
  try {
    await publishFromAnotherSession(other);
  } finally {
    await other.dispose();
  }
  await page.clock.fastForward(RECHECK);
  await main.getByRole('link', { name: /^Clase 11 Traducción/ }).click();
  await expect(main.getByText(DRAFT_TEXT)).toBeVisible();
  await route.getByRole('link', { name: 'Apuntes' }).click();
  await expect(main.getByText(NEW_NOTE)).toBeVisible();
  expect(await notReloaded(page)).toBe(true);

  // Undoing it in this session's panel: the next page is the published one again.
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitem', { name: /Administración/ }).click();
  const undo = page.getByRole('button', { name: 'Deshacer la última publicación' });
  await expect(undo).toBeEnabled();
  await undo.click();
  const dialog = page.getByRole('alertdialog', { name: /^¿Deshacer la publicación n\.º \d+\?$/ });
  await dialog.getByRole('button', { name: 'Deshacer' }).click();
  await expect(dialog).toBeHidden();
  await expect(undo).toBeDisabled();
  await page.goBack();
  await expect(main.getByRole('link', { name: /^Clase 11 Traducción/ })).toBeVisible();
  await expect(main.getByText(NEW_NOTE)).toHaveCount(0);
  await main.getByRole('link', { name: /^Clase 11 Traducción/ }).click();
  await expect(main.getByText(PUBLISHED_TEXT)).toBeVisible();
  expect(await notReloaded(page)).toBe(true);
});
