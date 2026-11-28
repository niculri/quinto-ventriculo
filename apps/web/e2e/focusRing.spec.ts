// E2e tests of the keyboard's focus: the bell, a list and a button over a card show the same solid ring as the rest of
// the site (WCAG 2.4.7 and 1.4.11), not a faint one or none.
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './test';
import { signIn } from './helpers';

/** Tabs until `target` has the focus, as a keyboard user gets there (so that `:focus-visible` applies). */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((e) => e === document.activeElement)) return;
  }
  throw new Error('the focus never got there');
}

const ring = (target: Locator) =>
  target.evaluate((e) => {
    const style = getComputedStyle(e);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });

test('the bell, the lists of «Tus ramos» and «Quitar» show a solid ring of 2 px', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: /^¿En qué semestre estás\?/ }).click();
  await page.getByRole('menuitemradio', { name: '1° Semestre' }).click();
  await page.mouse.click(1, 1);
  const targets = [
    page.getByRole('button', { name: /^Novedades/ }),
    page.getByRole('button', { name: /^¿En qué semestre estás\?/ }),
    page.getByRole('button', { name: /^Quitar .+ de tus ramos$/ }).first(),
  ];
  await expect(targets[2]!).toBeVisible();
  for (const target of targets) {
    await tabTo(page, target);
    expect(await ring(target)).toEqual({
      style: 'solid',
      width: '2px',
      color: expect.not.stringMatching(/rgba\(.*, 0(\.\d+)?\)$/) as unknown as string,
    });
  }
});
