// E2e test that a page's section titles share one letter: the serif of the page titles, also in the test's results.
import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { signIn } from './helpers';

/** The section titles of the page (not the small labels in capitals over a list) and their family. */
const titles = (page: Page) =>
  page
    .getByRole('main')
    .locator('h2')
    .evaluateAll((els) =>
      els
        .filter(
          (e) => !e.closest('.sr-only') && Number.parseFloat(getComputedStyle(e).fontSize) >= 17,
        )
        .map((e) => [e.textContent.trim(), getComputedStyle(e).fontFamily.split(',')[0]]),
    );

for (const url of ['/help', '/home', '/semesters/2/courses/biologia-celular']) {
  test(`the section titles of ${url} are in the serif`, async ({ page }) => {
    await signIn(page);
    await page.goto(url);
    await expect(page.getByRole('main').locator('h2').first()).toBeVisible();
    const found = await titles(page);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter(([, family]) => !family!.includes('Source Serif'))).toEqual([]);
  });
}

test('«Para repasar» of the test’s results is in the serif too', async ({ page }) => {
  await signIn(page);
  await page.goto('/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica');
  await page.getByRole('button', { name: 'Comenzar' }).click();
  await page.getByRole('list', { name: 'Alternativas' }).getByRole('button').last().click();
  await page
    .getByRole('button', { name: /^Terminar/ })
    .first()
    .click();
  const review = page.getByRole('heading', { level: 2, name: /^Para repasar/ });
  await expect(review).toBeVisible();
  expect(await review.evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Source Serif');
});
