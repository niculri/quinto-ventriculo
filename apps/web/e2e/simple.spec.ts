import { expect, test } from './test';
import { ONLY_ACCEPTED } from './accepted';
import type { Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

/** A student who just arrived: without the preferences the other tests start with. */
test.use({ storageState: ONLY_ACCEPTED });

const COURSE_URL = '/semesters/1/courses/anatomia-1';
const front = (page: Page) => page.getByRole('region', { name: 'Frente de la tarjeta' });

test('a new student: enters the course, turns a lecture on and studies with two buttons', async ({
  page,
}) => {
  await signIn(page);
  // Nothing turned on yet: the home page says so; with their semester, it takes them to the course.
  const home = page.getByRole('region', { name: 'Hoy' });
  await expect(home).toContainText('Todavía no activas ninguna semana o clase');
  await page.getByRole('button', { name: /¿En qué semestre estás\?/ }).click();
  await page.getByRole('menuitemradio', { name: '1° Semestre' }).click();
  await home.getByRole('link', { name: 'Elegir qué estudiar' }).click();
  await expect(page).toHaveURL(new RegExp(`${COURSE_URL}$`));

  // With nothing on, the list of what can be turned on is already open.
  const week = page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' });
  await expect(week).not.toBeChecked();
  await expect(page.getByText('Sin activar').first()).toBeVisible();
  await week.click();
  await expect(week).toBeChecked();
  // The list does not fold away from under the finger, and the course's card shows the day's load.
  await expect(page.getByText('Qué estás estudiando · 1 de 1 activada')).toBeVisible();
  const today = page.getByRole('group', { name: 'Hoy en Certamen 1' });
  await expect(today).toContainText(/\d+ para hoy · ~\d+ min/);

  await page.goto(`${DECK_URL}/study`);

  // The first time: the welcome, once.
  const welcome = page.getByRole('dialog', { name: 'Cómo se estudia aquí' });
  await expect(welcome).toContainText('Intenta acordarte');
  await welcome.getByRole('button', { name: 'Entendido' }).click();
  await expect(welcome).toHaveCount(0);

  await expect(front(page).locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  const answer = page.getByRole('group', { name: 'Responder' });
  await expect(answer.getByRole('button')).toHaveCount(2);
  await expect(answer.getByRole('button', { name: /^Otra vez/ })).toBeVisible();
  await answer.getByRole('button', { name: /^Bien/ }).click();
  await expect(front(page)).toContainText('Pregunta sin extra ni pista');

  // Undo is a button.
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(front(page).locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await expect(page.getByText('Deshecho: Responder tarjeta')).toBeVisible();

  // With the keyboard: space shows the answer, 2 is «Bien».
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: 'Reverso de la tarjeta' })).toBeVisible();
  await page.keyboard.press('2');
  await expect(front(page)).toContainText('Pregunta sin extra ni pista');

  // «Más»: the few things one does with a card.
  await page.getByRole('button', { name: 'Más' }).click();
  await expect(page.getByRole('menuitem', { name: /Enterrar/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: /Saltar por hoy/ }).click();
  await expect(page.getByText('Saltada por hoy.')).toBeVisible();

  // It stays: back in the study, the welcome does not show again.
  await page.reload();
  await expect(front(page)).toBeVisible();
  await expect(welcome).toHaveCount(0);
});

test('with nothing turned on, «Estudiar» says what to do and links to where to do it', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${COURSE_URL}/anki/study`);
  await expect(
    page.getByRole('heading', { name: 'Todavía no activas esta materia' }),
  ).toBeVisible();
  // Without a card in front, the welcome does not open: the screen already says what to do (step 3.2).
  await expect(page.getByRole('dialog', { name: 'Cómo se estudia aquí' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Elegir qué estudiar' }).click();
  await expect(page).toHaveURL(new RegExp(`${COURSE_URL}$`));
  await expect(page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' })).toBeVisible();
});

test('the assessment’s page: new cards a day and «Incluir extras», and its Extras only with it', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' }).click();
  const list = page.getByRole('list', { name: 'Submazos' });
  await expect(list.getByText('Mazo de prueba', { exact: true })).toBeVisible();
  // Its name is not a link: there is nothing more inside it, and the switch says what is studied.
  await expect(list.getByRole('link', { name: 'Mazo de prueba', exact: true })).toHaveCount(0);
  await expect(list.getByText('Extras', { exact: true })).toHaveCount(0);

  const load = page.getByRole('group', { name: 'Para hoy' }).getByRole('button');
  await expect(load).toHaveText(/^4 para hoy/);
  // The breakdown: on opening it.
  await load.click();
  await expect(page.getByRole('group', { name: 'Para hoy' })).toContainText('Aprendiendo');

  const number = page.getByRole('spinbutton', { name: 'Tarjetas nuevas por día' });
  await expect(number).toHaveValue('20');
  await number.fill('2');
  await number.press('Enter');
  await expect(load).toHaveText(/^2 para hoy/);

  await page.getByRole('switch', { name: 'Incluir extras' }).click();
  await expect(list.getByText('Extras', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Incluir extras' })).toBeChecked();
  await expect(number).toHaveValue('2');
});

test('«Modo avanzado» adds options, and the four buttons are a choice of their own', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/anki');
  await expect(page.getByRole('heading', { name: 'Anki general' })).toBeVisible();
  await expect(page.getByLabel('Límite del estudio por adelantado')).toHaveCount(0);
  await page.getByRole('switch', { name: /Modo avanzado/ }).check();
  // Its options, in a box of their own; on saving, it says so.
  await expect(page.getByLabel('Límite del estudio por adelantado')).toBeVisible();
  await expect(page.getByText('Sin guardar')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();

  // The same page of the assessment: the switch, and its button.
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' }).click();
  await expect(
    page.getByRole('button', { name: 'Configuración de S1 - Semana de prueba' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Submazos' })).toHaveCount(0);

  await page.goto(`${DECK_URL}/study`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(page.getByRole('group', { name: 'Responder' }).getByRole('button')).toHaveCount(2);

  await page.goto('/settings/anki');
  await page.getByRole('switch', { name: 'Mostrar los 4 botones' }).check();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.goto(`${DECK_URL}/study`);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(page.getByRole('group', { name: 'Responder' }).getByRole('button')).toHaveCount(4);
});

test('the browser: filters of one click, no «Notas» nor «Olvidar», and «Reportar error» in the preview', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/anki/browse');
  const filters = page.getByRole('group', { name: 'Filtros rápidos' });
  await expect(page.getByText('4 tarjetas').or(page.getByText(/^\d+ tarjetas$/))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notas' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Olvidar/ })).toHaveCount(0);

  await filters.getByRole('button', { name: 'Nuevas' }).click();
  await expect(page).toHaveURL(/q=is%3Anew|q=is:new/);
  await expect(filters.getByRole('button', { name: 'Nuevas' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Another state replaces it; the syntax is still what the search understands.
  await filters.getByRole('button', { name: 'Ocultas' }).click();
  await expect(page).toHaveURL(/is(%3A|:)suspended/);
  await expect(page).not.toHaveURL(/is(%3A|:)new/);
  await expect(page.getByText('0 tarjetas')).toBeVisible();
  await filters.getByRole('button', { name: 'Ocultas' }).click();

  await page.getByRole('grid').getByRole('row').nth(1).click();
  await page
    .getByRole('complementary', { name: 'Vista previa' })
    .getByRole('button', { name: 'Reportar error' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Reportar error' });
  await dialog.getByLabel('¿Qué está mal?').fill('Una falta de ortografía');
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Gracias: tu reporte le llegó al autor.')).toBeVisible();
});

test('on a small phone: nothing scrolls sideways, and the welcome can be closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page);
  const sideways = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  for (const url of [
    '/home',
    COURSE_URL,
    `${COURSE_URL}/anki/certamen-1`,
    DECK_URL,
    '/settings/anki',
    '/anki/browse',
  ]) {
    await page.goto(url);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect.poll(sideways, { message: url }).toBe(0);
  }
  // The welcome comes only with a card in front.
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' }).click();
  await expect(page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' })).toBeChecked();
  await page.goto(`${DECK_URL}/study`);
  const close = page.getByRole('button', { name: 'Entendido' });
  await expect(close).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('heading', { name: 'Cómo se estudia aquí' })).toBeInViewport();
  await close.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(sideways).toBe(0);
});

test('showing the answer does not change the size of the card, nor move what is below', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' }).click();
  await page.goto(`${DECK_URL}/study`);
  await page.getByRole('button', { name: 'Entendido' }).click();
  const show = page.getByRole('button', { name: 'Mostrar respuesta' });
  await expect(front(page)).toBeVisible();
  const card = (await front(page).boundingBox())!;
  const bar = (await show.boundingBox())!;
  await show.click();
  const back = page.getByRole('region', { name: 'Reverso de la tarjeta' });
  await expect(back).toBeVisible();
  expect(await back.boundingBox()).toEqual(card);
  const again = (await page.getByRole('button', { name: /^Otra vez/ }).boundingBox())!;
  expect(again.y).toBe(bar.y);
  expect(again.height).toBe(bar.height);
});

test('nothing moves while a slow deck arrives', async ({ page }) => {
  await signIn(page);
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' }).click();
  await page.route('**/api/decks/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  const list = page.getByRole('list', { name: 'Submazos' });
  await expect(list).toBeVisible();
  // Never the table of the full Anki.
  await expect(page.getByRole('table')).toHaveCount(0);
  const before = (await list.boundingBox())!;
  const load = page.getByRole('group', { name: 'Para hoy' }).getByRole('button');
  await expect(load).toHaveText(/para hoy/);
  await expect(page.getByRole('table')).toHaveCount(0);
  expect((await list.boundingBox())!.y).toBe(before.y);

  // The course's page: its line is there from the start.
  await page.goto(COURSE_URL);
  const line = page.getByRole('button', { name: /Qué estás estudiando/ });
  await expect(line).toBeVisible();
  const y = (await line.boundingBox())!.y;
  await expect(page.getByRole('group', { name: 'Hoy en Certamen 1' })).toContainText(/para hoy/);
  expect((await line.boundingBox())!.y).toBe(y);
});

test('the home page on a phone: the name of the course over its load and its button', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'on a wide screen they fit side by side');
  await signIn(page);
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' }).click();
  await page.goto('/home');
  const today = page.getByRole('region', { name: 'Hoy' });
  const study = today.getByRole('link', { name: 'Estudiar' });
  await expect(study).toBeVisible();
  const name = (await today.getByRole('link', { name: /Anatomía I/ }).boundingBox())!;
  expect(name.y + name.height).toBeLessThanOrEqual((await study.boundingBox())!.y);
});

test('after studying, a new visit shows the answered lecture turned on, also after turning modes', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/anki');
  await page.getByRole('switch', { name: /Modo avanzado/ }).check();
  await page.getByRole('switch', { name: 'Mostrar los 4 botones' }).check();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByLabel('Límite del estudio por adelantado')).toBeVisible();

  // An answer.
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' }).click();
  await page.goto(`${DECK_URL}/study`);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.keyboard.press('4');
  await expect(front(page)).toContainText('Pregunta sin extra ni pista');

  // Back to simple: that week counts as on, without touching anything, and the answer is still there.
  await page.goto('/settings/anki');
  await page.getByRole('switch', { name: /Modo avanzado/ }).uncheck();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByLabel('Límite del estudio por adelantado')).toHaveCount(0);
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await expect(page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' })).toBeChecked();
  await page.goto(`/anki/browse?q=${encodeURIComponent('is:review')}`);
  await expect(page.getByText('1 tarjetas').or(page.getByText('1 tarjeta'))).toBeVisible();
});
