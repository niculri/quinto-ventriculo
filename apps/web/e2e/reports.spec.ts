import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Step 2.6: reporting an error in an article (selecting text: the bar at the bottom, which moves nothing) and in a
 * question of a test (under the verdict, and from the finished round); the panel by content, «Resolver» with a note,
 * and what the student sees in «Mis reportes». The demo's user is a student and the administrator at once.
 */
const ARTICLE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';

/** Starts counting layout shifts (CLS) from now. */
async function watchShifts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __shift: number };
    w.__shift = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number })[]) {
        w.__shift += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: false });
  });
}
const shifts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shift: number }).__shift);

test('an article: select text, the bar at the bottom moves nothing, and the report brings the quote and its section', async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.goto(ARTICLE);
  await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
  const paragraph = page.getByText('El tRNA pasa del sitio A al P y del P al E.');
  await paragraph.scrollIntoViewIfNeeded();
  // The index on the side follows the reading and opens the section that is read: let it settle first.
  await page.waitForTimeout(800);
  const title = page.getByRole('heading', { level: 3, name: 'Sitios A, P y E' });
  const before = await title.boundingBox();
  await watchShifts(page);
  // The Selection API, as a finger or the mouse leaves it: part of the paragraph.
  await paragraph.evaluate((p) => {
    const text = p.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 19);
    const s = document.getSelection()!;
    s.removeAllRanges();
    s.addRange(range);
  });
  const bar = page.getByRole('button', { name: 'Reportar lo seleccionado' });
  await expect(bar).toBeVisible();
  // At the bottom of the screen, not next to the selection; and nothing moved.
  const box = (await bar.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 80);
  expect(await title.boundingBox()).toEqual(before);
  expect(await shifts(page)).toBe(0);

  // On the phone, a finger's tap (touch events), not a mouse click: it is what could take the selection away.
  if (testInfo.project.name === 'phone') await bar.tap();
  else await bar.click();
  const dialog = page.getByRole('dialog', { name: 'Reportar error' });
  await expect(dialog.getByLabel('Texto seleccionado')).toHaveText('tRNA pasa del si');
  await dialog.getByLabel('¿Qué está mal?').fill('Falta decir de dónde sale el tRNA');
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Gracias: tu reporte le llegó al autor.')).toBeVisible();
  await expect(bar).toHaveCount(0);

  // The panel: one row for the article, with the quote, its section and a link that finds it.
  await page.goto('/admin/reports');
  await expect(page.getByText('Falta decir de dónde sale el tRNA')).toBeVisible();
  const row = page
    .getByRole('listitem')
    .filter({ hasText: 'Falta decir de dónde sale el tRNA' })
    .first();
  await expect(row).toContainText('Sitios A, P y E');
  const quote = row.getByRole('link', { name: /tRNA pasa del si/ });
  await expect(quote).toHaveAttribute(
    'href',
    /11-traduccion#sitios:~:text=El-,tRNA%20pasa%20del%20si,-tio/,
  );
  await row.getByRole('button', { name: 'Resolver' }).click();
  const resolve = page.getByRole('dialog', { name: 'Resolver' });
  // The article is still in the version they saw (2): the fix goes in the next one.
  await expect(resolve.getByLabel('Corregido en la versión')).toHaveValue('3');
  await resolve.getByLabel('Nota para quien lo reportó (opcional)').fill('Ya se agregó.');
  await resolve.getByRole('button', { name: 'Resolver el reporte' }).click();
  await expect(resolve).toHaveCount(0);
  await expect(page.getByText('Falta decir de dónde sale el tRNA')).toHaveCount(0);

  // What the student sees.
  await page.goto('/settings/reports');
  const mine = page.getByRole('listitem').filter({ hasText: 'Falta decir de dónde sale el tRNA' });
  await expect(mine).toContainText('Corregido (versión 3)');
  await expect(mine).toContainText('Ya se agregó.');
});

test('a test: «Reportar error» under the verdict, with «La clave está mal», and from the finished round', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  // A wrong one, so that it is in the results' «Para repasar».
  await page
    .getByRole('list', { name: 'Alternativas' })
    .getByRole('button')
    .filter({ hasNotText: 'Splicing alternativo' })
    .first()
    .click();
  const next = page.getByRole('button', { name: /Siguiente|Ver resultado/ });
  const before = await next.boundingBox();
  await page.getByRole('button', { name: 'Reportar error' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reportar error' });
  await expect(
    dialog.getByRole('button', { name: 'Qué tipo de error: La clave está mal' }),
  ).toBeVisible();
  // A number typed here does not move the test on.
  await dialog.getByLabel('¿Qué está mal?').fill('1 la clave debería ser otra');
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await next.boundingBox()).toEqual(before);

  await page.getByRole('button', { name: 'Terminar ahora' }).click();
  const results = page.locator('.repaso');
  await results.getByRole('button', { name: 'Reportar error' }).first().click();
  await dialog.getByLabel('¿Qué está mal?').fill('Desde el resultado');
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(dialog).toHaveCount(0);

  // In the panel: the same question is one row with the two reports, and it says which test and question.
  await page.goto('/admin/reports');
  const row = page.getByRole('listitem').filter({ hasText: '1 la clave debería ser otra' }).first();
  await expect(row).toContainText('Pregunta de test');
  await expect(row).toContainText('Preguntas de práctica');
  await expect(row).toContainText('Desde el resultado');
  await expect(row).toContainText('La clave está mal');
});
