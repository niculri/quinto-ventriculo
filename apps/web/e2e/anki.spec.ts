// E2e test of the whole Anki tour with the synthetic deck: the course's deck tree, studying from the assessment, the
// cards' table with Anki's search and «Opciones».
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { DECK_URL, loadCards, signIn } from './helpers';

const today = async (page: Page) => {
  const text = await page.getByRole('group', { name: 'Para hoy' }).first().innerText();
  return loadCards(text);
};

test('course → Certamen 1 → study → browse → options', async ({ page, isMobile }) => {
  await signIn(page);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Anki' })).toHaveCount(0);
  await page.goto('/anki');
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('main').getByRole('link', { name: 'Ver toda la carrera' }).click();
  await page
    .getByRole('main')
    .getByRole('link', { name: /1° Semestre/ })
    .first()
    .click();
  // /courses lists «Anatomía I» too: clicking it there before the semester's page came lost to that navigation.
  await expect(page).toHaveURL(/\/semesters\/1$/);
  await page
    .getByRole('link', { name: /Anatomía I/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/semesters\/1\/courses\/anatomia-1$/);
  await page.getByRole('main').getByRole('link', { name: 'Todos los mazos del ramo' }).click();
  await expect(page).toHaveURL(/\/semesters\/1\/courses\/anatomia-1\/anki$/);
  await expect.poll(() => today(page)).toBeGreaterThan(0);
  const tree = page.getByRole('list', { name: 'Submazos' });
  for (const name of ['Certamen 1', 'S1 - Semana de prueba', 'Mazo de prueba']) {
    await expect(tree.getByText(name, { exact: true })).toBeVisible();
  }

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
  await page.getByRole('link', { name: 'Ver las tarjetas' }).click();
  await expect(page).toHaveURL(/\/anki\/certamen-1\/cards$/);
  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Tabla' }).click();
  const grid = page.getByRole('grid', { name: 'Tarjetas' });
  await expect(page.getByText('16 tarjetas', { exact: true })).toBeVisible();

  const box = page.getByRole('searchbox', { name: /Buscar/ });
  await box.fill('is:review');
  await box.press('Enter');
  await expect(page.getByText('1 tarjetas', { exact: true })).toBeVisible();
  await grid.getByRole('row', { name: /¿Cuántas vértebras/ }).click();
  const info = page.getByRole('region', { name: 'Información de la tarjeta' });
  await expect(info.getByRole('table', { name: 'Historial de repasos' })).toContainText('Fácil');
  await page.getByRole('button', { name: 'Suspender' }).click();
  await expect(page.getByRole('button', { name: 'Quitar suspensión' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Deshecho: Suspender tarjeta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspender' })).toBeVisible();
  await page.getByRole('button', { name: 'Olvidar…' }).click();
  await page
    .getByRole('dialog', { name: 'Olvidar' })
    .getByRole('button', { name: 'Olvidar' })
    .click();
  await expect(page.getByText('0 tarjetas', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitem', { name: /Opciones/ }).click();
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
