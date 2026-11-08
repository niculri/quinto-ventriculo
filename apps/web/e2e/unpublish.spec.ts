import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Step 1.5: a piece taken off the site (`npm run unpublish`). The API no longer has it (404) and the catalog no longer
 * lists it: its link gives the site's «no existe» page, in the frame, without anything moving; a test taken off in
 * the middle of a round lets the round go on, and a reload gives the same page.
 */
const ARTICLE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';
const NOT_FOUND = 'Esta página no aparece ni en el Netter';

interface CatalogShape {
  semesters: {
    courses: { assessments: { notes: { slug: string }[]; quizzes: { slug: string }[] }[] }[];
  }[];
}

/** From now on the site no longer has that article or test, as after unpublish_content(). */
async function takeOff(page: Page, piece: { note?: string; quiz?: string }) {
  await page.route('**/api/catalog', async (route) => {
    const response = await route.fetch();
    const catalog = (await response.json()) as CatalogShape;
    for (const s of catalog.semesters) {
      for (const c of s.courses) {
        for (const a of c.assessments) {
          a.notes = a.notes.filter((n) => n.slug !== piece.note);
          a.quizzes = a.quizzes.filter((q) => q.slug !== piece.quiz);
        }
      }
    }
    await route.fulfill({ response, json: catalog });
  });
  const gone = (route: Route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not_found', message: 'No existe.' }),
    });
  if (piece.note) await page.route(`**/api/notes/${piece.note}`, gone);
  if (piece.quiz) await page.route('**/api/quizzes/**', gone);
}

/** The «no existe» page, and that it stays still (nothing jumps in after it appears). */
async function stillNotFound(page: Page) {
  const title = page.getByRole('heading', { level: 1, name: NOT_FOUND });
  await expect(title).toBeVisible();
  const first = await title.boundingBox();
  await page.waitForTimeout(800);
  expect(await title.boundingBox()).toEqual(first);
  await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

test('an article taken off the site: its link gives the «no existe» page, without anything moving', async ({
  page,
}) => {
  await signIn(page);
  await takeOff(page, { note: '11-traduccion' });
  await page.goto(ARTICLE);
  await stillNotFound(page);
  // Nor is it in the list of its assessment.
  await page.goto('/semesters/2/courses/biologia-celular/assessments/certamen-2/notes');
  await expect(
    page.getByRole('main').getByRole('link', { name: /Clase 11.*Traducción/ }),
  ).toHaveCount(0);
});

test('a test taken off the site: its link gives the «no existe» page', async ({ page }) => {
  await signIn(page);
  await takeOff(page, { quiz: 'preguntas-de-practica' });
  await page.goto(TEST_URL);
  await stillNotFound(page);
});

test('a test taken off in the middle of a round: the round goes on; reloading, the «no existe» page', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  const heading = page.getByRole('heading', { level: 2 }).first();
  await expect(heading).toHaveText('¿Qué explica el resultado?');

  await takeOff(page, { quiz: 'preguntas-de-practica' });
  const option = (name: RegExp) =>
    page.getByRole('list', { name: 'Alternativas' }).getByRole('button', { name });
  await option(/Splicing alternativo/).click();
  await expect(page.getByText('Correcta', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(heading).toHaveText('Respecto de TBP, es correcto:');
  await option(/Sólo I$/).click();
  await expect(page.getByText('Incorrecta. La correcta es la B')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);

  await page.reload();
  await stillNotFound(page);
});
