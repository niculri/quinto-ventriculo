// E2e tests of a page that waits for the catalog or fails to load it: never blank, «Cargando…» in the page's frame with
// the title's row where the title will be, and the error box where the page starts, not centered.
import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { signIn } from './helpers';

const NOTE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const COURSE = '/semesters/2/courses/biologia-celular';
const API = /^https?:\/\/[^/]+\/api\//;

const top = (page: Page, selector: string) =>
  page
    .getByRole('main')
    .locator(selector)
    .first()
    .evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    });

for (const [name, url] of [
  ['a note', NOTE],
  ['a course', COURSE],
] as const) {
  test(`${name} waiting for the catalog says «Cargando…», with the title's row where its title comes`, async ({
    page,
  }) => {
    await signIn(page);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(API, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(url);
    const main = page.getByRole('main');
    await expect(main.getByRole('status')).toContainText('Cargando…');
    const waiting = await top(page, '.h-9');
    release();
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await top(page, 'h1')).toEqual(waiting);
  });
}

test('a failed load shows its error where the page starts, not centered', async ({ page }) => {
  await signIn(page);
  await page.goto(COURSE);
  const start = await top(page, 'nav');
  await page.route(API, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'internal', message: 'Falló la prueba.' }),
    }),
  );
  await page.reload();
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('No se pudo cargar', { timeout: 15_000 });
  expect((await top(page, '[role="alert"]')).x).toBe(start.x);
});

test('with reduced motion, «Cargando…» still says it is loading: a slow fade, not a turn', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  await page.route(API, () => undefined);
  await page.goto(COURSE);
  const spinner = page.getByRole('main').getByRole('status').locator('svg');
  await expect(spinner).toBeVisible();
  expect(await spinner.evaluate((e) => getComputedStyle(e).animationName)).toBe('qv-loading-fade');
});
