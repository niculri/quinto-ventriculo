import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
    // A mouse wheel notch, then the small steps of a trackpad.
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

/** The synthetic deck of the test content (packages/anki-format/test/fixtures), where it is in the tree. */
export const DECK_URL =
  '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba';

/** Signs in (demo session) and waits for the home page. */
export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
  await expect(page).toHaveURL(/\/home$/);
}
