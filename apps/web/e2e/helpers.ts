// Helpers of the e2e tests: signing in, the test deck's URL and scrolling a long card.
import { expect } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';

/**
 * Scrolls a long card with the wheel (a mouse or a trackpad) or with a finger (phone), and says how far its
 * box went. Inside the viewer (Radix Dialog), the dialog's scroll lock must let it through.
 */
export async function scrollCard(page: Page, region: Locator, how: 'wheel' | 'finger') {
  const scroller = region.locator('.qv-scroll');
  await expect
    .poll(() => scroller.evaluate((e) => e.scrollHeight - e.clientHeight))
    .toBeGreaterThan(50);
  const box = (await region.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (how === 'wheel') {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 120);
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 8);
  } else {
    // Real touch events, a finger dragging up. `Input.synthesizeScrollGesture` scrolls on macOS but not in the
    // headless Chromium of Linux CI, where it never moved the card.
    const cdp = await page.context().newCDPSession(page);
    const point = (dy: number) => [{ x: Math.round(x), y: Math.round(y + dy), id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(-15 * i),
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(20);
}

export const DECK_URL =
  '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba';

export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
  await expect(page).toHaveURL(/\/home$/);
}

const MODE_ROW = { name: /^Modo admin/ };

/** The row «Modo admin» of the account menu: opens the menu, and leaves it open. */
export async function openModeRow(page: Page) {
  await page.getByRole('button', { name: /tu cuenta$/i }).click();
  const row = page.getByRole('menuitemcheckbox', MODE_ROW);
  await expect(row).toBeVisible();
  return row;
}

/** Whether the admin mode is on (the menu is opened and closed again). */
export async function adminModeIsOn(page: Page) {
  const row = await openModeRow(page);
  const on = (await row.getAttribute('aria-checked')) === 'true';
  await page.keyboard.press('Escape');
  await expect(row).toBeHidden();
  return on;
}

/** Puts the admin mode on or off from the account menu. */
export async function setAdminMode(page: Page, on: boolean) {
  const row = await openModeRow(page);
  if (((await row.getAttribute('aria-checked')) === 'true') === on) {
    await page.keyboard.press('Escape');
    return;
  }
  await row.click();
  await expect(row).toBeHidden();
}

/**
 * Where the tags of a page are, against the breadcrumbs on their row, the bar above and the column's right edge, in page
 * coordinates.
 */
export function tagGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (e: Element) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y + window.scrollY, right: b.right, bottom: b.bottom + window.scrollY };
    };
    const tag = document.querySelector('main [data-admin-tag]')!;
    const row = tag.parentElement!;
    const route = row.querySelector('nav')!;
    const crumbs = [...route.querySelectorAll('li')];
    return {
      tag: rect(tag),
      row: rect(row),
      route: rect(route),
      crumbs: crumbs.map((c) => rect(c)),
      cut: [...route.querySelectorAll('li span')].some((s) => s.scrollWidth > s.clientWidth),
      /** What the route says of itself, as it is seen: the labels that are cut with «…», and the whole text of each crumb. */
      cutLabels: [...route.querySelectorAll('li span')]
        .filter((s) => s.scrollWidth > s.clientWidth)
        .map((s) => s.textContent),
      seen: crumbs.filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.textContent),
      bar: rect(document.querySelector('header')!),
      title: rect(document.querySelector('main h1')!),
      sideScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

/**
 * The API's whole answer for a test that changes it: without the validator the client sends, which the API would answer
 * with a 304 that has nothing to change.
 */
export function fetchWhole(route: Route) {
  const { 'if-none-match': _validator, ...headers } = route.request().headers();
  return route.fetch({ headers });
}
