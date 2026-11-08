import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
  await expect(page).toHaveURL(/\/home$/);
}

test('without a session no material is shown: only the landing page', async ({ page }) => {
  await page.goto('/notes/11-traduccion');
  await expect(page).toHaveURL(/\/\?next=/);
  await expect(page.getByRole('heading', { level: 1, name: 'El Quinto Ventrículo' })).toBeVisible();
  await expect(page.getByText('Los ribosomas tienen dos subunidades.')).toHaveCount(0);

  const api = await page.request.get('/api/catalog');
  expect(api.status()).toBe(401);
});

test('sign in and navigate to a note, with no reading progress on home', async ({ page }) => {
  await signIn(page);
  // Each click waits for its page: on home, the «2° Semestre» card also names «Biología celular».
  // In the page, not the site's menu (which has the same links).
  const main = page.getByRole('main');
  await main.getByRole('link', { name: /2° Semestre/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: '2° Semestre' })).toBeVisible();
  await main.getByRole('link', { name: /Biología celular/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Biología celular/ })).toBeVisible();
  await main.getByRole('link', { name: /Apuntes/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Apuntes' })).toBeVisible();
  await main
    .getByRole('link', { name: /Traducción/ })
    .first()
    .click();

  await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
  await expect(page.getByText('Entra en la prueba.')).toBeVisible();
  const figure = page.getByRole('img', { name: 'Ribosoma' });
  await expect(figure).toBeVisible();
  await expect
    .poll(() => figure.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
    .toBeGreaterThan(0);

  // There is no reading progress any more (removed at the author's request): home shows no «Seguir leyendo».
  await page.goto('/home');
  await expect(page.getByRole('heading', { level: 1, name: /Hola/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Seguir leyendo' })).toHaveCount(0);
});

test('a link with a tricky destination neither leaves the site nor breaks the sign-in', async ({
  page,
}) => {
  // The browser strips the tab: «/\t/example.com» would become «//example.com».
  await page.goto(`/?next=${encodeURIComponent('/\t/example.com')}&notice=Escribe+tu+clave`);
  await expect(page.getByText('Escribe tu clave')).toHaveCount(0);
  await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/home$/);
  await expect(page.getByRole('heading', { level: 1, name: /Hola/ })).toBeVisible();
});

test('the enlarged image opens and closes', async ({ page }) => {
  await signIn(page);
  await page.goto('/notes/11-traduccion');
  await page.getByRole('img', { name: 'Ribosoma' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Un ribosoma')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('images cannot be requested without a signature', async ({ page }) => {
  await signIn(page);
  const r = await page.request.get('/api/media/notes/0123456789abcdef0123456789abcdef.webp');
  expect(r.status()).toBe(403);
});

test('search without accents and reach the section', async ({ page, isMobile }) => {
  await signIn(page);
  if (isMobile) {
    await page.getByRole('button', { name: /Buscar en la página/ }).click();
  } else {
    await page.keyboard.press('ControlOrMeta+k');
  }
  await page.getByRole('combobox', { name: 'Buscar en la página' }).fill('nucleolo');
  await expect(page.getByRole('option', { name: /El nucléolo/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(
    /\/semesters\/2\/courses\/biologia-celular\/notes\/10-nucleo-celular#nucleolo$/,
  );
  await expect(page.getByRole('heading', { level: 2, name: 'El nucléolo' })).toBeInViewport();
});

test('signing out goes back to the landing page', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/home');
  await expect(page).toHaveURL(/\/\?next=/);
});

test('on the phone the TOC opens as a panel at the top', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await signIn(page);
  await page.goto('/notes/11-traduccion');
  await page.getByRole('button', { name: 'Índice', exact: true }).click();
  await page.locator('#toc-panel').getByRole('link', { name: '2. Elongación' }).click();
  await expect(page).toHaveURL(/#elongacion$/);
  await expect(page.locator('#toc-panel')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: '2. Elongación' })).toBeInViewport();
});

test('the URLs follow the hierarchy, and old links redirect keeping the anchor', async ({
  page,
}) => {
  await signIn(page);
  const main = page.getByRole('main');
  await main.getByRole('link', { name: /2° Semestre/ }).click();
  await expect(page).toHaveURL(/\/semesters\/2$/);
  await main.getByRole('link', { name: /Biología celular/ }).click();
  await expect(page).toHaveURL(/\/semesters\/2\/courses\/biologia-celular$/);
  await main.getByRole('link', { name: /Apuntes/ }).click();
  await expect(page).toHaveURL(/\/assessments\/certamen-2\/notes$/);
  await main
    .getByRole('link', { name: /Núcleo celular/ })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/semesters\/2\/courses\/biologia-celular\/notes\/10-nucleo-celular$/,
  );

  // A saved link with the old form: to the canonical URL, with its ?query and its #anchor.
  await page.goto('/notes/10-nucleo-celular?desde=guardado#nucleolo');
  await expect(page).toHaveURL(
    /\/semesters\/2\/courses\/biologia-celular\/notes\/10-nucleo-celular\?desde=guardado#nucleolo$/,
  );
  await expect(page.getByRole('heading', { level: 2, name: 'El nucléolo' })).toBeInViewport();
  // The redirect replaced the old entry: «back» does not return to it.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/notes\/10-nucleo-celular\?desde/);

  await page.goto('/courses/biologia-celular');
  await expect(page).toHaveURL(/\/semesters\/2\/courses\/biologia-celular$/);
});
