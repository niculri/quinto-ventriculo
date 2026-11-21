// E2e tests of the switch that turns a course off for everybody: it leaves the catalog, the menu, the home page and
// the search, its links give «no existe», its routes answer 404, and turning it on again gives it all back.
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

const ARTICLE = '/semesters/2/courses/biologia-celular/notes/10-nucleo-celular';
const QUIZ = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';
const COURSE = '/semesters/1/courses/anatomia-1';
const NOT_FOUND = 'Esta página no aparece ni en el Netter';
const AUTH = { Authorization: 'Bearer demo-local' };

/** The browser keeps what the API answers for a minute: a student sees the change when that has passed. */
async function forgetCache(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
}

test.describe('a course turned off', () => {
  // One list for the whole demo server: only one project changes it, and it is emptied at the end.
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'the list is the same for the whole demo server');

  test.afterEach(async ({ page }) => {
    await page.request.put('/api/admin/site-settings', {
      headers: AUTH,
      data: { hiddenCourses: [] },
    });
  });

  test('the panel turns it off; the site forgets it, and turning it on brings it back as it was', async ({
    page,
  }) => {
    await signIn(page);
    const main = page.getByRole('main');
    const menu = page.getByRole('navigation', { name: 'Menú del sitio' });
    await expect(main.getByRole('region', { name: 'Hoy' })).toBeVisible();
    await page.goto(ARTICLE);
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
    const catalogBefore = await (await page.request.get('/api/catalog', { headers: AUTH })).text();

    await page.goto('/admin/site');
    const bio = page.getByRole('switch', { name: 'Biología celular' });
    const anatomy = page.getByRole('switch', { name: 'Anatomía I' });
    const save = page.getByRole('button', { name: 'Guardar' });
    await expect(bio).toBeChecked();
    await expect(save).toBeDisabled();
    await bio.click();
    await anatomy.click();
    await expect(page.getByText('Sin guardar')).toBeVisible();
    // Nothing changed for anybody until it is saved.
    expect(
      (await page.request.get('/api/notes/10-nucleo-celular', { headers: AUTH })).status(),
    ).toBe(200);
    await save.click();
    await expect(page.getByText('Guardado')).toBeVisible();
    await expect(bio).not.toBeChecked();

    expect(
      (await page.request.get('/api/notes/10-nucleo-celular', { headers: AUTH })).status(),
    ).toBe(404);
    expect((await page.request.get('/api/quizzes', { headers: AUTH })).status()).toBe(200);
    const quizzes = (await (await page.request.get('/api/quizzes', { headers: AUTH })).json()) as {
      quizzes: unknown[];
    };
    expect(quizzes.quizzes).toEqual([]);

    await forgetCache(page);
    await menu.getByRole('link', { name: 'Inicio' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(main.getByRole('link', { name: /Anatomía I/ })).toHaveCount(0);
    await expect(menu.getByText(/Anatomía I|Biología celular/)).toHaveCount(0);
    await page.goto('/courses');
    await expect(main.getByText(/Biología celular|Anatomía I/)).toHaveCount(0);

    for (const url of [ARTICLE, QUIZ, COURSE, DECK_URL]) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
    }
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox', { name: 'Buscar en la página' }).fill('nucleolo');
    await expect(page.getByRole('option', { name: /El nucléolo/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.goto('/admin/site');
    await bio.click();
    await anatomy.click();
    await save.click();
    await expect(page.getByText('Guardado')).toBeVisible();
    await forgetCache(page);
    expect(await (await page.request.get('/api/catalog', { headers: AUTH })).text()).toBe(
      catalogBefore,
    );
    await page.goto(ARTICLE);
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto(DECK_URL);
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toHaveCount(0);
  });
});
