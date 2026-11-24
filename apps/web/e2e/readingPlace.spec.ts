// E2e tests of the reading place of an article: a reload, «Atrás» and «Adelante» come back to the block being read,
// also at another width; a new visit starts at the top, and a link to a section goes to the section.
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

const ARTICLE = '/dev/reading';
/** The site's bar is 4rem: what is read is just below it. */
const LINE = 72;

/** The text of the block of the article's body on the reading line, and how far it is into it (none while it loads). */
const onTheLine = (page: Page) =>
  page.evaluate((line) => {
    const blocks = [...(document.querySelector('.note-article')?.children ?? [])];
    const block = blocks.findLast((b) => b.getBoundingClientRect().top <= line);
    if (!block) return { text: '', into: 0 };
    const r = block.getBoundingClientRect();
    return { text: block.textContent.slice(0, 60), into: (line - r.top) / r.height };
  }, LINE);

async function openArticle(page: Page, url = ARTICLE) {
  await page.goto(url);
  await expect(page.locator('.note-article')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Scrolls until the given block of the body is a third of the way across the reading line. */
async function readAt(page: Page, index: number) {
  await page.evaluate(
    ({ index, line }) => {
      const block = document.querySelector('.note-article')!.children[index]!;
      const r = block.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 3 - line);
    },
    { index, line: LINE },
  );
  // The place is kept on the next frame after scrolling.
  await page.waitForTimeout(300);
  return onTheLine(page);
}

test('a reload comes back to the block being read, also at another width', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await openArticle(page);
  const reading = await readAt(page, 12);
  expect(reading.into).toBeCloseTo(1 / 3, 1);
  await page.reload();
  await expect(page.locator('.note-article')).toBeVisible();
  await expect.poll(async () => (await onTheLine(page)).text).toBe(reading.text);
  expect((await onTheLine(page)).into).toBeCloseTo(1 / 3, 1);

  if (isMobile) return;
  await page.setViewportSize({ width: 900, height: 720 });
  await page.reload();
  await expect.poll(async () => (await onTheLine(page)).text).toBe(reading.text);
});

test('«Atrás» and «Adelante» come back to it; a new visit starts at the top', async ({ page }) => {
  await signIn(page);
  await openArticle(page);
  const reading = await readAt(page, 15);
  await page.goto('/home');
  await expect(page.getByRole('region', { name: 'Hoy' })).toBeVisible();
  await page.goBack();
  await expect.poll(async () => (await onTheLine(page)).text).toBe(reading.text);
  await page.goForward();
  await expect(page.getByRole('region', { name: 'Hoy' })).toBeVisible();
  await page.goBack();
  await expect.poll(async () => (await onTheLine(page)).text).toBe(reading.text);

  // The same address from another page is a new visit (the same one typed again is a reload, for the browser).
  await page.goto('/home');
  await openArticle(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('a link to a section goes to the section, not to what was being read', async ({ page }) => {
  await signIn(page);
  await openArticle(page);
  await readAt(page, 15);
  const id = await page.evaluate(() => document.querySelector('.note-article h2[id]')!.id);
  await page.goto(`${ARTICLE}#${id}`);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate((i) => document.getElementById(i)?.getBoundingClientRect().top ?? 1e6, id),
    )
    .toBeLessThan(200);
});
