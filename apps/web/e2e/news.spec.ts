// E2e tests of the news: the line of the home page, the bell of the top bar and «Novedades», with the announcements of
// e2e/content/announcements.json. Nothing moves while they load nor when the bell opens, and the bar fits at 375 px.
import { expect, test } from './test';
import type { Locator, Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

const NEWEST = 'Biología celular · Certamen 2: dos clases y un test de práctica';

async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { shift_: number };
    w.shift_ = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!e.hadRecentInput) w.shift_ += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const shift = (page: Page) => page.evaluate(() => (window as unknown as { shift_: number }).shift_);

const box = (l: Locator) =>
  l.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return {
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.width),
      h: Math.round(b.height),
    };
  });

const bell = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Novedades/ });

const bar = async (page: Page) => ({
  logo: await box(page.getByRole('link', { name: 'El Quinto Ventrículo, inicio' })),
  search: await box(page.getByRole('banner').getByRole('button', { name: /Buscar en la página/ })),
  bell: await box(bell(page)),
  account: await box(page.getByRole('button', { name: /tu cuenta$/i })),
});

test('the home page’s line: nothing moves while it loads, and it says the newest unread', async ({
  page,
}) => {
  await watchShifts(page);
  await signIn(page);
  const line = page.getByRole('link', { name: new RegExp(`^Novedades: Nuevo: ${NEWEST}`) });
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute('href', '/news');
  const height = (await line.boundingBox())!.height;
  expect(height).toBe(48);
  await page.waitForTimeout(800);
  expect(await shift(page)).toBeLessThan(0.02);
});

test('the bell: a dot while something is unread, between the search and the name; opening it moves nothing', async ({
  page,
}) => {
  await signIn(page);
  await expect(bell(page)).toHaveAccessibleName('Novedades: hay algo nuevo');
  await expect(page.getByTestId('news-dot')).toBeVisible();
  const before = await bar(page);
  expect(before.bell.x).toBeGreaterThan(before.search.x + before.search.w - 1);
  expect(before.bell.x + before.bell.w).toBeLessThanOrEqual(before.account.x);

  // With the keyboard: the bell is a button, its menu items take the arrows.
  await bell(page).focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: new RegExp(NEWEST) })).toBeVisible();
  await expect(menu.getByText('Nuevo')).toHaveCount(2);
  expect(await bar(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(bell(page)).toHaveAccessibleName('Novedades');
  await expect(page.getByTestId('news-dot')).toBeHidden();
  expect(await bar(page)).toEqual(before);
  await expect(page.getByRole('link', { name: /^Novedades: Al día en tus ramos/ })).toBeVisible();

  // What was seen stays seen after a reload.
  await page.reload();
  await expect(page.getByRole('link', { name: /^Novedades: Al día en tus ramos/ })).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName('Novedades');
});

test('«Novedades»: every announcement by day, «Ver todas» from the bell, and nothing moves while it loads', async ({
  page,
}) => {
  await signIn(page);
  await bell(page).click();
  await page.getByRole('menuitem', { name: 'Ver todas' }).click();
  await expect(page).toHaveURL(/\/news$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Novedades' })).toBeVisible();
  await expect(page.getByText(NEWEST)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Biología celular · Certamen 2', exact: true }),
  ).toHaveAttribute('href', '/semesters/2/courses/biologia-celular#certamen-2');

  await watchShifts(page);
  await page.reload();
  await expect(page.getByText(NEWEST)).toBeVisible();
  await page.waitForTimeout(800);
  expect(await shift(page)).toBeLessThan(0.02);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test('the bar fits at 375 px with the bell, without a side scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signIn(page);
  const b = await bar(page);
  for (const part of [b.logo, b.search, b.bell, b.account]) {
    expect(part.x).toBeGreaterThanOrEqual(0);
    expect(part.x + part.w).toBeLessThanOrEqual(375);
  }
  expect(b.search.w).toBeGreaterThan(40);
  await bell(page).click();
  const menu = (await page.getByRole('menu').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('there is no bell while studying a deck', async ({ page }) => {
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();
  await expect(bell(page)).toHaveCount(0);
});
