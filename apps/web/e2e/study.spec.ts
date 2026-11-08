import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DECK_URL, scrollCard, signIn } from './helpers';

/** A whole study session with the synthetic deck (e2e/content), in the advanced mode. */
async function openDeck(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/semesters/1/courses/anatomia-1/anki/certamen-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Certamen 1' })).toBeVisible();
}

/** What the deck has for today, on its page: «4 para hoy» gives 4. */
const today = async (page: Page) => {
  const text = await page.getByRole('group', { name: 'Para hoy' }).first().innerText();
  return Number(/(\d+) para hoy/.exec(text)?.[1] ?? 0);
};

/** «4+0+0»: new, learning and to review. */
const counts = async (page: Page) =>
  (
    await page
      .getByRole('group', { name: 'Tarjetas que quedan' })
      .locator('[title]')
      .allTextContents()
  )
    .map((t) => t.replace(/\D/g, ''))
    .join('+');

const front = (page: Page) => page.getByRole('region', { name: 'Frente de la tarjeta' });

async function showAnswer(page: Page) {
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(page.getByRole('region', { name: 'Reverso de la tarjeta' })).toBeVisible();
}

test('study, undo, bury, suspend and finish the deck', async ({ page }) => {
  await openDeck(page);
  await expect.poll(() => today(page)).toBeGreaterThan(0);
  await page.goto(`${DECK_URL}/study`);

  // The first card, its answer and the four buttons with Anki's intervals.
  await expect(front(page).locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await expect.poll(() => counts(page)).toBe('4+0+0');
  await showAnswer(page);
  const answer = page.getByRole('group', { name: 'Responder' });
  await expect(answer.getByRole('button', { name: 'Otra vez (<1 m)' })).toBeVisible();
  await expect(answer.getByRole('button', { name: 'Bien (<10 m)' })).toBeVisible();
  await answer.getByRole('button', { name: /^Bien/ }).click();
  await expect(front(page)).toContainText('Pregunta sin extra ni pista');
  await expect.poll(() => counts(page)).toBe('3+1+0');

  // Undo: back to the same card.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(front(page).locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await expect.poll(() => counts(page)).toBe('4+0+0');
  await expect(page.getByText('Deshecho: Responder tarjeta')).toBeVisible();

  // «Fácil»: out of today's queue.
  await showAnswer(page);
  await answer.getByRole('button', { name: /^Fácil/ }).click();
  await expect(front(page)).toContainText('Pregunta sin extra ni pista');
  await expect.poll(() => counts(page)).toBe('3+0+0');

  // Bury from «Más» (the phone has no keyboard), suspend with Anki's shortcut.
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('menuitem', { name: /Enterrar tarjeta/ }).click();
  await expect(page.getByText('Tarjeta enterrada.')).toBeVisible();
  await expect(front(page)).toContainText('La columna tiene');
  await page.keyboard.press('@');
  await expect(page.getByText('Tarjeta suspendida.')).toBeVisible();
  // With that card suspended, the next card of its note is no longer buried by it (as in Anki): 2 left.
  await expect.poll(() => counts(page)).toBe('2+0+0');

  // An occlusion, with the keyboard: space shows the answer, 4 is «Fácil».
  await expect(front(page).locator('#image-occlusion-canvas')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: 'Reverso de la tarjeta' })).toBeVisible();
  await page.keyboard.press('4');

  // The second gap of the cloze: «Suspender nota» from «Más».
  await expect(front(page)).toContainText('La columna tiene');
  await expect.poll(() => counts(page)).toBe('1+0+0');
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('menuitem', { name: /Suspender nota/ }).click();
  await expect(
    page.getByRole('heading', { name: '¡Felicitaciones! Has finalizado este mazo por ahora.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Una o más tarjetas fueron enterradas y se mostrarán mañana.'),
  ).toBeVisible();

  // It is kept (in the demo, in the browser): back on the deck page nothing is left today.
  await page.getByRole('link', { name: 'Volver al mazo' }).click();
  await expect.poll(() => today(page)).toBe(0);
  await page.reload();
  await expect.poll(() => today(page)).toBe(0);
});

test('a long card scrolls with the wheel and with a finger on the study screen', async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name === 'phone' ? { width: 412, height: 600 } : { width: 800, height: 520 },
  );
  await openDeck(page);
  await page.getByRole('link', { name: 'Estudiar', exact: true }).click();
  await showAnswer(page);
  const back = page.getByRole('region', { name: 'Reverso de la tarjeta' });
  await scrollCard(page, back, info.project.name === 'phone' ? 'finger' : 'wheel');
});

test('Configuración de mazos: a lower limit of new cards changes the counts', async ({ page }) => {
  await openDeck(page);
  await expect.poll(() => today(page)).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Configuración de Mazo de prueba' }).click();
  await page.getByRole('link', { name: 'Editar o crear configuraciones' }).click();
  await expect(page).toHaveURL(/\/settings\/deck-options\?preset=Default$/);
  const limit = page.getByLabel('Tarjetas nuevas/día');
  await expect(limit).toHaveValue('20');
  await limit.fill('2');
  await limit.press('Enter');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.goto('/semesters/1/courses/anatomia-1/anki/certamen-1');
  await expect.poll(() => today(page)).toBe(2);
});

test('a student reports an error in a card and the administrator sees it in the panel', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/semesters/1/courses/anatomia-1/anki/study');
  await expect(page.getByRole('region', { name: 'Frente de la tarjeta' })).toBeVisible();
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('menuitem', { name: 'Reportar error' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reportar error' });
  // Typing a space or a number here does not answer the card.
  await dialog.getByLabel('¿Qué está mal?').fill('La respuesta 1 está mal');
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Gracias: tu reporte le llegó al autor.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();

  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { level: 2, name: 'Reportes' })).toBeVisible();
  await expect(page.getByText('La respuesta 1 está mal')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar resuelto' }).click();
  await expect(page.getByText('La respuesta 1 está mal')).toHaveCount(0);
  await page.getByRole('button', { name: /Resueltos/ }).click();
  await expect(page.getByText('La respuesta 1 está mal')).toBeVisible();
});

test('a card taken out of the site in the middle of a session is skipped, and the session goes on', async ({
  page,
}) => {
  // The author takes «Pregunta sin extra ni pista» out while the student studies: the API no longer has it (404).
  await page.route('**/api/cards/**', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes('Pregunta sin extra ni pista')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not_found', message: 'No existe esa tarjeta.' }),
      });
      return;
    }
    await route.fulfill({ response, body });
  });
  await openDeck(page);
  await expect.poll(() => today(page)).toBeGreaterThan(0);
  await page.goto(`${DECK_URL}/study`);

  await expect(front(page).locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await expect.poll(() => counts(page)).toBe('4+0+0');
  await showAnswer(page);
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Fácil/ })
    .click();

  // The next card would be the one taken out: it is skipped, without an error or «Reintentar».
  await expect(front(page)).toContainText('La columna tiene');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  await expect(page.getByText('Se detuvo la sesión')).toHaveCount(0);
  await expect.poll(() => counts(page)).toBe('2+0+0');
  await showAnswer(page);
  await page.keyboard.press('4');
  await expect(front(page).locator('#image-occlusion-canvas')).toBeVisible();
});
