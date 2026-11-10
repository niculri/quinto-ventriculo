import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { CONTACT_EMAIL } from '@qv/schema';

/** Steps 2.1 and 2.2: where to write, on the landing page and in the notice of an uninvited account. */

const MAILTO = `mailto:${CONTACT_EMAIL}`;

/**
 * The layout shift of the page while it loads (Chrome's CLS, as e2e/exam.spec.ts measures it), in two parts: `shift`,
 * all of it, and `settledShift`, what moves once the web fonts are in.
 * Revisión de cero (2.1): when Inter (Fontsource, `font-display: swap`) arrives after the first paint, which happens
 * when the machine is busy, the hero's paragraph and the notice wrap again: 0.031 on the desktop with the notice, in 4
 * of 5 runs, a few milliseconds after the font (measured), without anything of the contact moving by itself. That is
 * the whole site's (left to the owner), not this step's: what this step has to keep still is measured once the two
 * families are in (`document.fonts.ready` does not wait for a font the page has not asked for yet), and the whole stays
 * under 0.1, Chrome's «good».
 */
async function loadAndMeasureShift(page: Page, url: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { shift: number; settledShift: number; settledAt: number };
    w.shift = 0;
    w.settledShift = 0;
    w.settledAt = Number.POSITIVE_INFINITY;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        startTime: number;
        hadRecentInput: boolean;
      }[]) {
        if (e.hadRecentInput) continue;
        w.shift += e.value;
        if (e.startTime > w.settledAt) w.settledShift += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url);
  await page.waitForFunction(() =>
    ['Inter Variable', 'Source Serif 4 Variable'].every((family) =>
      [...document.fonts].some(
        (f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded',
      ),
    ),
  );
  // Two frames: the one that lays the page out again with the fonts, and one more.
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (window as unknown as { settledAt: number }).settledAt = performance.now();
            done();
          }),
        ),
      ),
  );
}

/** Nothing moved once the fonts were in, and the whole load stays «good». */
async function expectStill(page: Page) {
  const { shift, settledShift } = await page.evaluate(() => {
    const w = window as unknown as { shift: number; settledShift: number };
    return { shift: w.shift, settledShift: w.settledShift };
  });
  expect(settledShift).toBeLessThan(0.005);
  expect(shift).toBeLessThan(0.1);
}

test('the landing page says where to write, as a mailto link, and nothing moves', async ({
  page,
}) => {
  await loadAndMeasureShift(page, '/');
  const faq = page.locator('dl');
  await expect(faq.getByText('No puedo entrar, ¿qué hago?')).toBeVisible();
  const links = faq.getByRole('link', { name: CONTACT_EMAIL });
  await expect(links).toHaveCount(3);
  for (const link of await links.all()) await expect(link).toHaveAttribute('href', MAILTO);
  const first = links.first();
  await first.scrollIntoViewIfNeeded();
  const before = await first.boundingBox();
  await page.waitForTimeout(500);
  expect(await first.boundingBox()).toEqual(before);
  await expectStill(page);
  // The address fits the phone's width: the page does not scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('the notice of an uninvited account has the address as a link, and nothing moves', async ({
  page,
}) => {
  await loadAndMeasureShift(page, '/?notice=invite');
  const notice = page.getByRole('alert');
  await expect(notice).toContainText('solo entran personas invitadas');
  await expect(notice).not.toContainText('Nico');
  const link = notice.getByRole('link', { name: CONTACT_EMAIL });
  await expect(link).toHaveAttribute('href', MAILTO);
  const before = await link.boundingBox();
  await page.waitForTimeout(500);
  expect(await link.boundingBox()).toEqual(before);
  await expectStill(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
