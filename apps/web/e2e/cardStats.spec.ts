// E2e tests of the student's own statistics (a deck's «Estadísticas»: nothing moves while they come, they follow what
// was studied, no side scroll on a phone) and of a question of a test in «Días de estudio».
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

const COURSE_URL = '/semesters/1/courses/anatomia-1';
const STATS_URL = `${COURSE_URL}/anki/certamen-1/stats`;
const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Where each section is, to compare before and after the numbers come. */
const places = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main section')].map((s) => {
      const b = s.getBoundingClientRect();
      return [b.y + window.scrollY, b.height].map(Math.round);
    }),
  );

test('the statistics of a deck: in their places while they come, and they follow what was studied', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${COURSE_URL}/anki/certamen-1`);
  await page.getByRole('link', { name: 'Estadísticas' }).click();
  await expect(page).toHaveURL(new RegExp(`${STATS_URL}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Tus estadísticas' })).toBeVisible();
  await expect(page.getByText(/^Viste 0 de \d+$/)).toBeVisible();
  await expect(page.getByText('Todavía no has olvidado ninguna de estas tarjetas.')).toBeVisible();
  const empty = await places(page);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);

  await page.goto(`${COURSE_URL}/anki/certamen-1/study`);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: /^Bien/ }).click();
  await page.goto(STATS_URL);
  await expect(page.getByText(/^Viste 1 de \d+$/)).toBeVisible();
  await expect(page.getByText(/^En total: 1 respuesta \(/)).toBeVisible();
  const table = page.getByRole('table', { name: /Tus respuestas, tu tiempo/ });
  await expect(table.getByRole('row').nth(1)).toContainText(/^Hoy1/);
  await expect(page.getByRole('img', { name: /Últimos 30 días: 1 respuesta\./ })).toBeVisible();
  expect(await places(page)).toEqual(empty);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});

test('a question answered in a test counts in today’s «Días de estudio», apart from Anki', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('qv-demo-heatmap', 'empty'));
  await signIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  await page
    .getByRole('list', { name: 'Alternativas' })
    .getByRole('button', { name: /Splicing alternativo/ })
    .click();
  await expect(page.getByText('Correcta', { exact: true })).toBeVisible();

  await page.goto('/home');
  const region = page.getByRole('region', { name: 'Días de estudio' });
  const today = region.getByRole('gridcell', { name: /\(hoy\): 1 respuesta$/ });
  await expect(today).toBeVisible();
  await expect(region.getByText(/^En la racha actual/)).toBeVisible();
  await region.scrollIntoViewIfNeeded();
  await today.click();
  const day = page.getByRole('dialog');
  await expect(day).toContainText('1 respuesta en tests');
  await expect(day.getByRole('listitem')).toHaveText(/Biología celular.*1 en tests$/);
  await expect(region.getByText('En la racha actual: 1 respuesta en tests')).toBeVisible();
});
