// E2e tests of the addresses of what is not published: each one is the page of an address made up, and the admin mode
// opens only what has material in the draft.
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { ADMIN_MODE_PORT, demoState } from './accepted';
import { setAdminMode, signIn } from './helpers';

const PHYSICS = '/semesters/2/courses/fisica';
const ANATOMY = '/semesters/1/courses/anatomia-1';
const BIOLOGY = '/semesters/2/courses/biologia-celular';
const MADE_UP = '/semesters/2/courses/inventado';
const DRAFT_NOTE = `${BIOLOGY}/notes/12-regulacion-del-borrador`;

const NOT_PUBLISHED = [
  '/semesters/3',
  PHYSICS,
  `${PHYSICS}/anki`,
  `${PHYSICS}/anki/cards`,
  `${PHYSICS}/anki/stats`,
  `${PHYSICS}/assessments/certamen-1/notes`,
  `${PHYSICS}/assessments/certamen-1/tests`,
  `${PHYSICS}/assessments/certamen-1/gymkana`,
  `${PHYSICS}/notes/10-nucleo-celular-de-fisica`,
  `${PHYSICS}/tests/certamen-1/practica`,
  `${ANATOMY}/assessments/certamen-1/notes`,
  `${ANATOMY}/assessments/certamen-1/tests`,
  `${BIOLOGY}/assessments/certamen-2/gymkana`,
  `${BIOLOGY}/anki`,
  `${BIOLOGY}/anki/cards`,
  `${ANATOMY}/anki/certamen-1/no-publicado`,
  `${ANATOMY}/anki/certamen-1/no-publicado/study`,
  `${BIOLOGY}/notes/no-publicado`,
  `${BIOLOGY}/tests/certamen-2/no-publicado`,
  '/decks/999',
];

/** The page as one reads it: the text of `main`, once its title is there. */
async function shown(page: Page, url: string) {
  await page.goto(url);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
  return main.innerText();
}

test('each address of what is not published is the page of one made up', async ({ page }) => {
  await signIn(page);
  const madeUp = await shown(page, MADE_UP);
  expect(madeUp).toContain('Esta página no aparece ni en el Netter');
  for (const url of NOT_PUBLISHED) expect(await shown(page, url), url).toBe(madeUp);

  // The menu and the semester's page do not link what does not exist.
  const menu = page.getByRole('navigation', { name: 'Menú del sitio' });
  await page.goto('/semesters/2');
  await expect(
    page.getByRole('main').getByRole('link', { name: /Biología celular/ }),
  ).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Física/ })).toHaveCount(0);
  await page.goto('/courses');
  await expect(page.getByRole('main').getByRole('link', { name: /2° Semestre/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /3° Semestre/ })).toHaveCount(0);
  if (await menu.isVisible()) {
    await expect(menu.getByRole('link', { name: /Física|3° Semestre/ })).toHaveCount(0);
  }
});

test('the API answers 404 for what is not published, as for something made up', async ({
  page,
}) => {
  const auth = { Authorization: 'Bearer demo-local' };
  for (const [path, never] of [
    ['/api/notes/12-regulacion-del-borrador', '/api/notes/no-existe'],
    ['/api/quizzes/no-publicado', '/api/quizzes/no-existe'],
    ['/api/decks/999', '/api/decks/998'],
  ] as const) {
    const r = await page.request.get(path, { headers: auth });
    expect(r.status(), path).toBe(404);
    expect(await r.json()).toEqual(await (await page.request.get(never, { headers: auth })).json());
  }
});

test.describe('in the admin mode', () => {
  test.use({
    baseURL: `http://localhost:${ADMIN_MODE_PORT}`,
    storageState: demoState(ADMIN_MODE_PORT),
  });

  test('what has material in the draft opens, and what has nothing does not', async ({ page }) => {
    await signIn(page);
    const madeUp = await shown(page, MADE_UP);
    expect(await shown(page, DRAFT_NOTE)).toBe(madeUp);
    await setAdminMode(page, true);
    await page.goto(DRAFT_NOTE);
    await expect(page.locator('[data-admin-tag]')).toHaveText('Borrador');
    for (const url of ['/semesters/3', PHYSICS, `${ANATOMY}/assessments/certamen-1/notes`]) {
      expect(await shown(page, url), url).toBe(madeUp);
    }
    await setAdminMode(page, false);
  });
});
