// E2e tests of the draft in the admin mode, on the phone too: a note only the draft has says «Borrador», and one that is
// published, with changes in the draft, says nothing. It changes no setting, so both projects can share the server.
import { expect, test } from './test';
import type { Locator } from '@playwright/test';
import { ADMIN_MODE_PORT, demoState } from './accepted';
import { signIn } from './helpers';

const NOT_FOUND = 'Esta página no aparece ni en el Netter';
const NEW_NOTE = '/semesters/2/courses/biologia-celular/notes/12-regulacion-del-borrador';
const CHANGED_NOTE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const SWITCH = { name: 'Modo admin' };

test.use({
  baseURL: `http://localhost:${ADMIN_MODE_PORT}`,
  storageState: demoState(ADMIN_MODE_PORT),
});

/** Where it is on the page, not on the screen. */
const place = (e: Locator) =>
  e.evaluate((x) => {
    const b = x.getBoundingClientRect();
    return [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round);
  });

test('a note that is only in the draft says «Borrador»; one published with changes says nothing', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await page.goto(NEW_NOTE);
  await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
  await page.getByRole('switch', SWITCH).check();
  const title = page.getByRole('main').getByRole('heading', { level: 1 });
  await expect(title).toContainText('Regulación');
  await expect(page.locator('[data-admin-tag]')).toHaveText('Borrador');
  const menu = page.getByRole('navigation', { name: 'Menú del sitio' });
  if (!isMobile) await expect(menu.locator('[data-admin-mark]')).toHaveText('Borrador');
  const tagged = (await place(title))[1];

  await page.goto(CHANGED_NOTE);
  await expect(title).toContainText('Traducción');
  // Not on the page, and in the menu only on the note that is new; the title is where it is under a tag.
  await expect(page.getByRole('main').locator('[data-admin-tag], [data-admin-mark]')).toHaveCount(
    0,
  );
  if (!isMobile) await expect(menu.locator('[data-admin-mark]')).toHaveCount(1);
  expect((await place(title))[1]).toBe(tagged);

  await page.goto('/semesters/2/courses/biologia-celular/assessments/certamen-2/notes');
  await expect(page.getByRole('main').locator('[data-admin-mark]')).toHaveText('Borrador');
  await page.getByRole('switch', SWITCH).uncheck();
  await expect(page.getByRole('main').getByText('Regulación')).toHaveCount(0);
  await page.goto(NEW_NOTE);
  await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
});
