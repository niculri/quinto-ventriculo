import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Step 3.1: the heatmap on the home page and on a course's page, with the demo's made-up past (features/stats/demo.ts;
 * `qv-demo-heatmap` = `empty`, `slow` or `error` for these tests). Nothing moves: loading it, with or without data,
 * changing the year and opening a day; the page never scrolls sideways (on the phone, the grid scrolls inside its box,
 * starting at today); the arrows go through the days.
 */

const COURSE_URL = '/semesters/1/courses/anatomia-1';

async function flags(page: Page, value: string | null) {
  await page.addInitScript((v) => {
    if (v === null) localStorage.removeItem('qv-demo-heatmap');
    else localStorage.setItem('qv-demo-heatmap', v);
  }, value);
}

/** Counts the layout shifts after `settle()`. */
async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { shift_: number; from_: number };
    w.shift_ = 0;
    w.from_ = Number.POSITIVE_INFINITY;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        startTime: number;
        hadRecentInput: boolean;
      }[]) {
        if (!e.hadRecentInput && e.startTime > w.from_) w.shift_ += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (window as unknown as { from_: number }).from_ = performance.now();
            done();
          }),
        ),
      ),
  );
const shift = (page: Page) => page.evaluate(() => (window as unknown as { shift_: number }).shift_);

const fontsLoaded = (page: Page) =>
  page.waitForFunction(() =>
    ['Inter Variable', 'Source Serif 4 Variable'].every((family) =>
      [...document.fonts].some(
        (f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded',
      ),
    ),
  );

const box = (page: Page) => page.getByRole('region', { name: 'Días de estudio' });
const today = (page: Page) => page.getByRole('gridcell', { name: /\(hoy\)/ });

/** Where the heatmap, its parts and what comes after it are in the page. */
const places = (page: Page) =>
  page.evaluate(() => {
    const at = (e: Element | null | undefined) => {
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round);
    };
    const section = document
      .querySelector('section[aria-labelledby] [role="grid"]')
      ?.closest('section');
    return {
      section: at(section),
      grid: at(section?.querySelector('[role="grid"]')),
      figures: at(section?.querySelector('dl')?.parentElement),
      after: at(document.getElementById('my-courses')),
    };
  });

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the same places with and without data, and while they come', async ({ page }) => {
  await flags(page, 'empty');
  await signIn(page);
  await expect(page.getByText('Tus días de estudio van a aparecer aquí.')).toBeVisible();
  await fontsLoaded(page);
  const empty = await places(page);

  await flags(page, null);
  await page.reload();
  await expect(box(page).getByText('Racha actual')).toBeVisible();
  await expect(today(page)).toBeVisible();
  await expect(box(page).locator('dd').first()).toHaveText(/\d+ respuestas?/);
  await fontsLoaded(page);
  expect(await places(page)).toEqual(empty);

  // The data come 1.5 s late: from the first frame with the page, nothing moves.
  await flags(page, 'slow');
  await watchShifts(page);
  await page.reload();
  await expect(box(page)).toBeVisible();
  await fontsLoaded(page);
  await settle(page);
  await expect(box(page).locator('dd').first()).toHaveText(/\d+ respuestas?/, { timeout: 5000 });
  await page.waitForTimeout(300);
  expect(await shift(page)).toBe(0);
  expect(await places(page)).toEqual(empty);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});

test('changing the year and opening a day move nothing', async ({ page }) => {
  await watchShifts(page);
  await signIn(page);
  await expect(today(page)).toBeVisible();
  await expect(box(page).locator('dd').first()).toHaveText(/\d+ respuestas?/);
  await fontsLoaded(page);
  // Step 3.2: the first steps come above it on the home page; in sight before clicking its days.
  await box(page).scrollIntoViewIfNeeded();
  await settle(page);
  const before = await places(page);
  const back = box(page).getByRole('button', { name: 'Año anterior' });
  await expect(back).toBeEnabled();
  const year = Number(
    await box(page).getByRole('group', { name: 'Año' }).locator('span').textContent(),
  );
  await back.click();
  await expect(page.getByRole('grid', { name: `Días de estudio de ${year - 1}` })).toBeVisible();
  expect(await places(page)).toEqual(before);
  await box(page).getByRole('button', { name: 'Volver a hoy' }).click();
  await expect(today(page)).toBeVisible();
  expect(await places(page)).toEqual(before);

  // A day: a box over the page, nothing pushed.
  await today(page).click();
  const day = page.getByRole('dialog');
  await expect(day).toBeVisible();
  await expect(day).toContainText(/hoy/);
  await expect(day.getByRole('link')).toHaveCount(0);
  expect(await places(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(day).toHaveCount(0);
  expect(await shift(page)).toBe(0);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});

test('the arrows go through the days, and Enter opens one', async ({ page }) => {
  await signIn(page);
  await expect(today(page)).toBeVisible();
  const name = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  await today(page).focus();
  const start = await name();
  expect(start).toMatch(/\(hoy\)/);
  await page.keyboard.press('ArrowUp');
  const up = await name();
  await page.keyboard.press('ArrowDown');
  expect(await name()).toBe(start);
  await page.keyboard.press('ArrowLeft');
  const week = await name();
  expect(new Set([start, up, week]).size).toBe(3);
  // Only one stop in the tab order.
  expect(await page.locator('[role="grid"] [tabindex="0"]').count()).toBe(1);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await name()).toBe(week);
});

test('on a narrow screen the grid scrolls inside its box and starts at today', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(today(page)).toBeVisible();
  const scroller = box(page).locator('div.overflow-x-auto');
  const { scroll, width, left } = await scroller.evaluate((e) => ({
    scroll: e.scrollWidth,
    width: e.clientWidth,
    left: e.scrollLeft,
  }));
  expect(scroll).toBeGreaterThan(width);
  // November or December: past the start, today in view.
  expect(left).toBeGreaterThan(0);
  const inside = await today(page).evaluate((cell) => {
    const c = cell.getBoundingClientRect();
    const b = cell.closest('.overflow-x-auto')!.getBoundingClientRect();
    return c.left >= b.left && c.right <= b.right;
  });
  expect(inside).toBe(true);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});

test('an error stays in the box, with «Reintentar»', async ({ page }) => {
  await flags(page, 'error');
  await signIn(page);
  const retry = box(page).getByRole('button', { name: 'Reintentar' });
  await expect(retry).toBeVisible();
  await expect(box(page).getByRole('grid')).toBeVisible();
});

test('a course’s page has its own', async ({ page }) => {
  await signIn(page);
  await page.goto(COURSE_URL);
  const own = page.getByRole('region', { name: 'Días de estudio' });
  await expect(own).toBeVisible();
  await expect(own.getByRole('gridcell', { name: /\(hoy\)/ })).toBeVisible();
  await expect(own.getByText('Racha más larga')).toBeVisible();
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});
