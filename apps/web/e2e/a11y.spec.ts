import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { DECK_URL } from './helpers';
import { ONLY_ACCEPTED } from './accepted';
import { expectNoViolationsInBothThemes as axe } from './a11y';

/**
 * axe (WCAG 2.2 A and AA) on every page and popup, in the light and the dark theme: a new violation fails the CI. The
 * touch sizes, the keyboard and the screen reader have their own tests (phone.spec.ts, viewer.spec.ts,
 * screen-reader.spec.ts).
 */
// The phone's layout is checked in WebKit (the iPhone project): the same pages a second time in Chromium would only add
// minutes to the CI.
test.skip(
  ({ isMobile, browserName }) => isMobile && browserName === 'chromium',
  'phone: in WebKit',
);

const COURSE = '/semesters/1/courses/anatomia-1';
const BIOCEL = '/semesters/2/courses/biologia-celular';
const ARTICLE = `${BIOCEL}/notes/11-traduccion`;
const TEST_URL = `${BIOCEL}/tests/certamen-2/preguntas-de-practica`;

const PUBLIC = ['/', '/privacy', '/terms', '/licenses', '/about'];

const SIGNED_IN = [
  '/home',
  '/courses',
  '/semesters/1',
  '/semesters/2',
  COURSE,
  BIOCEL,
  `${BIOCEL}/assessments/certamen-2/notes`,
  `${BIOCEL}/assessments/certamen-2/tests`,
  ARTICLE,
  `${TEST_URL}/pautas`,
  `${COURSE}/anki`,
  `${COURSE}/anki/certamen-1`,
  `${COURSE}/anki/certamen-1/cards`,
  `${COURSE}/anki/certamen-1/cards?view=table`,
  `${COURSE}/anki/certamen-1/cards/practice`,
  `${DECK_URL}/study`,
  `${COURSE}/anki/certamen-1/review`,
  '/settings/account',
  '/settings/reports',
  '/settings/anki',
  '/settings/deck-options',
  '/search?q=ribosoma',
  '/help',
  '/admin/releases',
  '/admin/reports',
  '/admin/usage',
  '/admin/access',
  '/admin/site',
  '/admin/unpublished',
  '/no-existe',
];

/** The page is drawn: its title (or the card) is there and nothing says «Cargando». */
async function settled(page: Page) {
  await expect(page.locator('h1, [role="region"][aria-label^="Frente"]').first()).toBeVisible();
  await expect(page.getByText(/^(Cargando|Preparando)/)).toHaveCount(0);
  await page.waitForLoadState('networkidle');
}

const signedIn = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('qv-demo-session', '1'));

for (const route of PUBLIC) {
  test(`axe without a session: ${route}`, async ({ page }) => {
    await page.goto(route);
    await settled(page);
    await axe(page, route);
  });
}

for (const route of SIGNED_IN) {
  test(`axe with a session: ${route}`, async ({ page }) => {
    await signedIn(page);
    await page.goto(route);
    await settled(page);
    await axe(page, route);
  });
}

test.describe('popups', () => {
  test.beforeEach(({ page }) => signedIn(page));

  test('the image viewer and the report of an image', async ({ page }) => {
    await page.goto(ARTICLE);
    await settled(page);
    await page.getByRole('button', { name: /Ampliar la imagen/ }).click();
    const viewer = page.getByRole('dialog');
    await expect(viewer).toBeVisible();
    await axe(page, 'visor');
    await viewer.getByRole('button', { name: 'Reportar esta imagen' }).click();
    await expect(page.getByRole('dialog', { name: /Reportar/ })).toBeVisible();
    await axe(page, 'reportar imagen');
  });

  test('studying: «Más» and «Reportar error»; the card viewer of the cards page', async ({
    page,
  }) => {
    await page.goto(`${DECK_URL}/study`);
    await settled(page);
    await page.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await axe(page, 'menú Más');
    await page.getByRole('menuitem', { name: 'Reportar error' }).click();
    await expect(page.getByRole('dialog', { name: /Reportar/ })).toBeVisible();
    await axe(page, 'reportar tarjeta');

    await page.goto(`${COURSE}/anki/certamen-1/cards`);
    await settled(page);
    await page.locator('[data-position="0"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await axe(page, 'visor de tarjetas');
  });

  test('a deck’s configuration, the search, the account menu and the phone’s menu', async ({
    page,
    isMobile,
  }) => {
    await page.goto(`${COURSE}/anki/certamen-1`);
    await settled(page);
    await page
      .getByRole('button', { name: /Configuración de/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await axe(page, 'configuración del mazo');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Buscar en la página/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.type('ribo');
    await axe(page, 'buscador');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /tu cuenta$/i }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await axe(page, 'menú de la cuenta');
    await page.keyboard.press('Escape');

    if (isMobile) {
      await page.getByRole('button', { name: 'Abrir el menú' }).click();
      await expect(page.getByRole('dialog', { name: 'Menú' })).toBeVisible();
      await axe(page, 'menú del teléfono');
    }
  });

  test('a test’s question, its verdict and its photo zoomed', async ({ page }) => {
    await page.goto(`${TEST_URL}/pautas`);
    await settled(page);
    await page.getByRole('button', { name: 'Comenzar' }).click();
    const options = page.getByRole('list', { name: 'Alternativas' }).getByRole('button');
    await expect(options.first()).toBeVisible();
    await axe(page, 'pregunta');
    await options.first().click();
    await expect(page.getByRole('region', { name: 'Pregunta' }).getByRole('status')).toHaveText(
      /Correcta|Incorrecta/,
    );
    await axe(page, 'veredicto');
    // The photo is the third question.
    const photo = page.getByRole('button', { name: /Ampliar la imagen/ });
    while (!(await photo.isVisible())) {
      await page.getByRole('button', { name: 'Siguiente' }).click();
      if (!(await photo.isVisible())) await options.first().click();
    }
    await photo.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await axe(page, 'foto ampliada');
  });
});

test('a test’s results', async ({ page }) => {
  await signedIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  await settled(page);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  const options = page.getByRole('list', { name: 'Alternativas' }).getByRole('button');
  const results = page.getByRole('button', { name: 'Ver resultado' });
  for (let i = 0; i < 5; i++) {
    await options.first().click();
    await expect(page.getByRole('button', { name: /^(Siguiente|Ver resultado)$/ })).toBeEnabled();
    if (await results.isVisible()) break;
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }
  await results.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await axe(page, 'resultados del test');
});

test.describe('popups of a student who just arrived', () => {
  test.use({ storageState: ONLY_ACCEPTED });

  test('the welcome to study', async ({ page }) => {
    await signedIn(page);
    await page.addInitScript(() =>
      localStorage.setItem(
        'qv-demo-study',
        JSON.stringify({ activations: [{ deckId: '1006809718735317183', active: true }] }),
      ),
    );
    await page.goto(`${DECK_URL}/study`);
    await expect(page.getByRole('dialog', { name: 'Cómo se estudia aquí' })).toBeVisible();
    await axe(page, 'bienvenida');
  });

  test('the terms on entering', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await signedIn(page);
    await page.goto('/home');
    await expect(page.getByRole('dialog')).toBeVisible();
    await axe(page, 'términos');
    await context.close();
  });
});
