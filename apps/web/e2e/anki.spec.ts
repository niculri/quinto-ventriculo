import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

/** What the deck has for today, on its page: «4 para hoy» gives 4. */
const today = async (page: Page) => {
  const text = await page.getByRole('group', { name: 'Para hoy' }).first().innerText();
  return Number(/(\d+) para hoy/.exec(text)?.[1] ?? 0);
};

/**
 * The whole tour with the synthetic deck (🦴 Anatomía I → Certamen 1 → S1 → Mazo de prueba → Extras): the
 * course's deck tree, studying from the assessment, the browser and «Opciones» → «Anki».
 */
test('course → Certamen 1 → study → browse → options', async ({ page, isMobile }) => {
  await signIn(page);
  // No Anki of every course: the top bar has no link to it, and /anki goes home.
  await expect(page.getByRole('banner').getByRole('link', { name: 'Anki' })).toHaveCount(0);
  await page.goto('/anki');
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('main').getByRole('link', { name: 'Ver toda la carrera' }).click();
  await page
    .getByRole('main')
    .getByRole('link', { name: /1° Semestre/ })
    .first()
    .click();
  await page
    .getByRole('link', { name: /Anatomía I/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/semesters\/1\/courses\/anatomia-1$/);
  // The course's page is a dashboard; its whole deck tree, one link away.
  await page.getByRole('main').getByRole('link', { name: 'Todos los mazos del ramo' }).click();
  await expect(page).toHaveURL(/\/semesters\/1\/courses\/anatomia-1\/anki$/);
  await expect.poll(() => today(page)).toBeGreaterThan(0);
  const tree = page.getByRole('list', { name: 'Submazos' });
  for (const name of ['Certamen 1', 'S1 - Semana de prueba', 'Mazo de prueba']) {
    await expect(tree.getByText(name, { exact: true })).toBeVisible();
  }

  // Certamen 1: its page, and studying from it studies everything below.
  await page.getByRole('navigation', { name: 'Ruta' }).getByText('Anatomía I').waitFor();
  await page.goto('/semesters/1/courses/anatomia-1/anki/certamen-1');
  await expect(page).toHaveURL(/\/semesters\/1\/courses\/anatomia-1\/anki\/certamen-1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Certamen 1' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Anatomía I');
  await page.getByRole('link', { name: 'Estudiar', exact: true }).click();
  await expect(page).toHaveURL(/\/anki\/certamen-1\/study$/);
  const front = page.getByRole('region', { name: 'Frente de la tarjeta' });
  await expect(front.locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Fácil/ })
    .click();
  await expect(front).toContainText('Pregunta sin extra ni pista');

  // A deck's configuration is chosen from the list, and its cards are in the browser.
  await page.goto(DECK_URL);
  await expect(page).toHaveURL(/\/anki\/certamen-1$/);
  await page.getByRole('button', { name: 'Configuración de Mazo de prueba' }).click();
  const presetDialog = page.getByRole('dialog', { name: /Configuración de Mazo de prueba/ });
  await expect(
    presetDialog.getByRole('button', { name: 'Configuración de este mazo: Default (del autor)' }),
  ).toBeVisible();
  await expect(
    presetDialog.getByRole('link', { name: 'Editar o crear configuraciones' }),
  ).toBeVisible();
  await presetDialog.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('link', { name: /Ver tarjetas de este mazo/ }).click();
  await expect(page).toHaveURL(/\/anki\/browse\?q=/);
  const grid = page.getByRole('grid', { name: 'Tarjetas' });
  await expect(page.getByText('16 tarjetas', { exact: true })).toBeVisible();

  // Search with Anki's syntax: the one just studied is a review now.
  const box = page.getByRole('searchbox', { name: /Buscar/ });
  await box.fill('is:review');
  await box.press('Enter');
  await expect(page.getByText('1 tarjetas', { exact: true })).toBeVisible();
  await grid.getByRole('row', { name: /¿Cuántas vértebras/ }).click();
  const info = page.getByRole('region', { name: 'Información de la tarjeta' });
  await expect(info.getByRole('table', { name: 'Historial de repasos' })).toContainText('Fácil');
  // Suspend it, and undo.
  await page.getByRole('button', { name: 'Suspender' }).click();
  await expect(page.getByRole('button', { name: 'Quitar suspensión' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Deshecho: Suspender tarjeta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspender' })).toBeVisible();
  // «Olvidar»: back to new, and it leaves this search.
  await page.getByRole('button', { name: 'Olvidar…' }).click();
  await page
    .getByRole('dialog', { name: 'Olvidar' })
    .getByRole('button', { name: 'Olvidar' })
    .click();
  await expect(page.getByText('0 tarjetas', { exact: true })).toBeVisible();

  // «Opciones» from the user menu: its page, then «Anki general» and «Configuración de mazos» from the side menu.
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitem', { name: /Opciones/ }).click();
  // Its sections: in the site's menu on the computer, as tabs on top of the page on the phone.
  const sections = page.getByRole('navigation', {
    name: isMobile ? 'Secciones de las opciones' : 'Menú del sitio',
  });
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Datos de usuario' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tu cuenta' })).toContainText('demo@ug.uchile.cl');
  await sections.getByRole('link', { name: 'General' }).click();
  await expect(page).toHaveURL(/\/settings\/anki$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Anki general' })).toBeVisible();
  await expect(page.getByLabel('El siguiente día empieza a las')).toBeVisible();
  await expect(page.getByLabel('Tarjetas nuevas/día')).toHaveCount(0);
  await sections.getByRole('link', { name: 'Configuración de mazos' }).click();
  await expect(page).toHaveURL(/\/settings\/deck-options/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Configuración de mazos' }),
  ).toBeVisible();
  await expect(page.getByLabel('Tarjetas nuevas/día')).toHaveValue('20');
  await expect(page.getByRole('region', { name: 'Mazos que la usan' })).toContainText(
    'Mazo de prueba',
  );
  // Neither «Opciones» nor the landing page scroll sideways (the phone included).
  const sideways = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await sideways()).toBeLessThanOrEqual(0);
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { level: 2, name: 'Datos de usuario' })).toBeVisible();
  expect(await sideways()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Lo que viene' })).toBeVisible();
  expect(await sideways()).toBeLessThanOrEqual(0);
});
