// E2e tests of the admin mode: an administrator in the student mode sees what a student sees; in the admin mode, the
// course turned off and the hidden semester, each with its tag, and what they study is saved as a student's.
import { expect, test } from './test';
import type { Locator, Page } from '@playwright/test';
import { ADMIN_MODE_PORT, demoState } from './accepted';
import { DECK_URL, adminModeIsOn, setAdminMode, signIn, tagGeometry } from './helpers';

const OFF_COURSE = '/semesters/1/courses/anatomia-1';
const NOT_FOUND = 'Esta página no aparece ni en el Netter';
const AUTH = { Authorization: 'Bearer demo-local' };

// The settings are one for the whole demo server: this spec has a server of its own, and its tests go one by one.
test.use({
  baseURL: `http://localhost:${ADMIN_MODE_PORT}`,
  storageState: demoState(ADMIN_MODE_PORT),
});
test.describe.configure({ mode: 'serial' });

/** Where it is on the page, not on the screen. */
const place = (e: Locator) =>
  e.evaluate((x) => {
    const b = x.getBoundingClientRect();
    return [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round);
  });

const marks = (page: Page) =>
  page.locator('[data-admin-tag], [data-admin-mark], [data-admin-note]');

test.beforeEach(async ({ page }) => {
  await page.request.put('/api/admin/site-settings', {
    headers: AUTH,
    data: { hiddenCourses: ['anatomia-1'], hideEmptySemesters: true },
  });
  await signIn(page);
});
test.afterEach(async ({ page }) => {
  await page.request.put('/api/admin/site-settings', {
    headers: AUTH,
    data: { hiddenCourses: [], hideEmptySemesters: false },
  });
});

test('as a student: no course turned off, no hidden semester and not a tag, mark or notice', async ({
  page,
}) => {
  expect(await adminModeIsOn(page)).toBe(false);
  await page.goto('/courses');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('main').getByText(/Anatomía I(?!I)|3° Semestre/)).toHaveCount(0);
  await expect(marks(page)).toHaveCount(0);
  await page.goto(OFF_COURSE);
  await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
});

test('in the admin mode: what is off is there, each with its tag, and the tag moves nothing', async ({
  page,
}) => {
  await page.goto('/courses');
  await setAdminMode(page, true);
  const main = page.getByRole('main');
  await expect(main.getByText(/Anatomía I(?!I)/)).toBeVisible();
  await expect(main.getByText('3° Semestre')).toBeVisible();
  await expect(main.locator('[data-admin-mark]').filter({ hasText: 'Ramo apagado' })).toBeVisible();
  // Semester 1 is left with nothing a student sees, and so is the empty 3.
  await expect(
    main.locator('[data-admin-mark]').filter({ hasText: 'Semestre oculto' }),
  ).toHaveCount(2);

  // The page of the course turned off: it is there, with its tag, and its title is where the title of a page without
  // tag is.
  await page.goto(OFF_COURSE);
  const tag = page.locator('[data-admin-tag]');
  await expect(tag).toContainText('Ramo apagado');
  const tagged = await place(main.getByRole('heading', { level: 1 }));
  await page.goto('/semesters/2/courses/biologia-celular');
  await expect(main.getByRole('heading', { level: 1 })).toContainText('Biología celular');
  await expect(tag).toHaveCount(0);
  expect(await place(main.getByRole('heading', { level: 1 }))).toEqual(tagged);
  await page.goto('/semesters/3');
  await expect(page.locator('[data-admin-tag]')).toContainText('Semestre oculto');
});

test('the tags are on the row of the breadcrumbs, to the right, centered with them and below the bar', async ({
  page,
}) => {
  await page.goto('/home');
  await setAdminMode(page, true);
  // The course turned off, in a semester a student does not see: two tags on one row.
  await page.goto(OFF_COURSE);
  await expect(page.locator('main [data-admin-tag] > span')).toHaveCount(2);
  const g = await tagGeometry(page);
  expect(Math.abs(g.tag.right - g.row.right)).toBeLessThanOrEqual(1);
  const first = g.crumbs[0]!;
  expect(Math.abs((g.tag.y + g.tag.bottom) / 2 - (first.y + first.bottom) / 2)).toBeLessThanOrEqual(
    1,
  );
  expect(g.tag.y - g.bar.bottom).toBeGreaterThanOrEqual(16);
  expect(g.crumbs.at(-1)!.right).toBeLessThanOrEqual(g.tag.x);
  expect(g.cut).toBe(false);
  expect(g.title.y).toBeGreaterThanOrEqual(g.row.bottom);
});

test('on a phone, two tags leave the route readable: the tags take the short word and no crumb is cut', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/home');
  await setAdminMode(page, true);
  await page.goto(OFF_COURSE);
  await expect(page.locator('main [data-admin-tag] > span')).toHaveCount(2);
  await expect(page.locator('main [data-admin-tag]')).toBeVisible();
  const g = await tagGeometry(page);
  expect(g.cutLabels).toEqual([]);
  expect(g.seen).toEqual(['Inicio', '1° Semestre', 'Anatomía I']);
  expect(g.route.right).toBeLessThanOrEqual(g.tag.x);
  expect(g.sideScroll).toBeLessThanOrEqual(0);
  const words = await page
    .locator('main [data-admin-tag] > span')
    .evaluateAll((tags) => tags.map((t) => (t as HTMLElement).innerText));
  expect(words).toEqual(['Oculto', 'Apagado']);
});

test('in the admin mode, studying a card of the course turned off is saved as always, and says nothing of it', async ({
  page,
}) => {
  const study = () => page.evaluate(() => window.localStorage.getItem('qv-demo-study'));
  await page.goto('/home');
  await setAdminMode(page, true);
  const before = await study();
  await page.goto(`${DECK_URL}/study`);
  await expect(page.locator('[data-admin-note]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Bien/ })
    .click();
  await expect.poll(study).not.toBe(before);
  const saved = await study();

  // Back as a student: the course is off again, and what was studied there is still saved.
  await page.goto('/home');
  await setAdminMode(page, false);
  expect(await study()).toBe(saved);
  await page.goto(DECK_URL);
  await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
  await expect(marks(page)).toHaveCount(0);
});
