// E2e test that the screens where one answers look alike: the same «Volver» at the same height, Anki's counts in the
// middle of the screen, and one reading width for the test's bar, its progress bar and the question.
import { expect, test } from './test';
import type { Locator, Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';

const box = async (l: Locator) => (await l.boundingBox())!;
const center = async (l: Locator) => {
  const b = await box(l);
  return b.x + b.width / 2;
};
const viewportCenter = (page: Page) =>
  page.evaluate(() => document.documentElement.clientWidth / 2);

test('studying a deck and answering a test: the same «Volver», the counts centered, the test at one width', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  const counts = page.getByRole('group', { name: 'Tarjetas que quedan' });
  await expect(page.getByRole('region', { name: 'Frente de la tarjeta' })).toBeVisible();

  const back = page.getByRole('link', { name: 'Volver a Anatomía I · Certamen 1' });
  await expect(back).toHaveAttribute('href', DECK_URL);
  await expect(back).toHaveAttribute('title', 'Anatomía I · Certamen 1');
  const text = back.getByText('Anatomía I · Certamen 1');
  if (isMobile) await expect(text).toBeHidden();
  else await expect(text).toBeVisible();
  expect(Math.abs((await center(counts)) - (await viewportCenter(page)))).toBeLessThan(2);
  const studyBack = await box(back);

  await page.goto(`${TEST_URL}/pautas`);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  const quizBack = page.getByRole('button', { name: 'Volver a Biología celular · Certamen 2' });
  await expect(quizBack).toBeVisible();
  await expect(quizBack).toHaveAttribute('title', 'Biología celular · Certamen 2');
  const quizText = quizBack.getByText('Biología celular · Certamen 2');
  if (isMobile) await expect(quizText).toBeHidden();
  else await expect(quizText).toBeVisible();
  const b = await box(quizBack);
  expect(Math.abs(b.y - studyBack.y)).toBeLessThan(1);
  expect(Math.abs(b.height - studyBack.height)).toBeLessThan(1);
  const question = await box(page.getByRole('region', { name: 'Pregunta' }));
  const row = await box(page.locator('.qz-bar .hrow'));
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  expect(Math.abs(question.width - Math.min(768, vw))).toBeLessThan(1);
  expect(Math.abs(question.x + question.width / 2 - vw / 2)).toBeLessThan(1);
  expect(Math.abs(row.x - question.x)).toBeLessThan(1);
  expect(Math.abs(row.width - question.width)).toBeLessThan(1);
  if (isMobile) expect(Math.abs(b.x - studyBack.x)).toBeLessThan(1);
  const card = await box(page.locator('.qcard'));
  const bar = await box(page.locator('.qz-bar .pb'));
  expect(Math.abs(bar.x - card.x)).toBeLessThan(1);
  expect(Math.abs(bar.width - card.width)).toBeLessThan(1);
  expect(Math.abs(b.x - card.x)).toBeLessThan(1);
  const end = await box(page.getByRole('button', { name: 'Terminar ahora' }));
  expect(Math.abs(end.x + end.width - (card.x + card.width))).toBeLessThan(1);

  const skip = page.getByRole('button', { name: 'Saltar' });
  await expect(skip).toBeEnabled();
  const next = page.getByRole('button', { name: 'Siguiente' });
  const s = await box(skip);
  const n = await box(next);
  expect(Math.abs(s.y - n.y)).toBeLessThan(1);
  expect(s.x).toBeLessThan(n.x);
  if (!isMobile) await expect(page.locator('.atajo')).toContainText('S saltar');

  await quizBack.click();
  await expect(page.getByRole('region', { name: 'Ronda a medias' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${TEST_URL}/pautas$`));
});
