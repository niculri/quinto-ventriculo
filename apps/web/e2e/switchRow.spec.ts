// E2e tests of the rows with a switch: a click anywhere on the row turns it, the switch looks the same, and another
// control on the row («Restablecer») still does its own thing.
import { expect, test } from './test';
import type { Locator, Page } from '@playwright/test';
import { signIn } from './helpers';

test.skip(({ isMobile }) => isMobile, 'desktop only: the rows are the same on the phone');

/** The drawn switch (the track): what the eye sees, which must not move or change size. */
const track = (input: Locator) => input.locator('xpath=following-sibling::span[1]');

/** Clicks the row of `input` near its left edge, far from the drawn switch, and says whether it turned. */
async function clickRowFarFromSwitch(page: Page, input: Locator) {
  await input.scrollIntoViewIfNeeded();
  const before = await input.isChecked();
  const row = (await input.boundingBox())!;
  const drawn = (await track(input).boundingBox())!;
  expect(row.width).toBeGreaterThan(drawn.width * 5);
  await page.mouse.click(row.x + 12, row.y + row.height / 2);
  await expect(input).toBeChecked({ checked: !before });
  expect(await track(input).boundingBox()).toEqual(drawn);
  expect(drawn.width).toBe(40);
  expect(drawn.height).toBe(24);
}

test('an option of «Anki general»: the whole row turns it, and «Restablecer» only restores', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/anki');
  const four = page.getByRole('switch', { name: 'Mostrar los 4 botones' });
  await expect(four).toBeChecked();
  await clickRowFarFromSwitch(page, four);
  await clickRowFarFromSwitch(page, four);
  const row = page.locator('div.relative', { has: four });
  await row.getByRole('button', { name: 'Restablecer el valor predeterminado' }).click();
  await expect(four).not.toBeChecked();
});

test('«Incluir extras» of an assessment: the whole row turns it', async ({ page }) => {
  await signIn(page);
  await page.goto('/semesters/1/courses/anatomia-1/anki/certamen-1');
  const extras = page.getByRole('switch', { name: 'Incluir extras' });
  await clickRowFarFromSwitch(page, extras);
  await clickRowFarFromSwitch(page, extras);
});

test('the site settings and the marks by hand of a draft: the whole row turns them', async ({
  page,
}) => {
  await page.route('**/api/admin/release/marks', (route) => {
    const { mark, checked } = route.request().postDataJSON() as { mark: string; checked: boolean };
    return route.fulfill({
      json: {
        marks: checked
          ? [{ mark, checkedBy: 'demo@ug.uchile.cl', checkedAt: '2026-11-07T15:00:00Z' }]
          : [],
      },
    });
  });
  await signIn(page);
  await page.goto('/admin/site');
  const hide = page.getByRole('switch', { name: 'Ocultar los semestres sin contenido' });
  await expect(hide).toBeEnabled();
  await clickRowFarFromSwitch(page, hide);
  await expect(hide).toBeEnabled();
  await clickRowFarFromSwitch(page, hide);

  await page.goto('/admin/releases');
  const phone = page.getByRole('switch', { name: 'Vi lo nuevo en el teléfono' });
  await expect(phone).toBeVisible();
  await clickRowFarFromSwitch(page, phone);
  await clickRowFarFromSwitch(page, phone);
});

test('a row under the sticky «Guardar» bar takes none of its clicks, nor paints over it', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/anki');
  await expect(page.getByRole('switch', { name: 'Mostrar los 4 botones' })).toBeChecked();
  const hits = await page.evaluate(async () => {
    document.body.style.minHeight = '300vh';
    const input = document.querySelector<HTMLElement>('[aria-label="Mostrar los 4 botones"]')!;
    const restore = input
      .closest('.relative')!
      .querySelector<HTMLElement>('[aria-label="Restablecer el valor predeterminado"]')!;
    const save = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Guardar')!;
    const bar = save.closest<HTMLElement>('.sticky')!;
    const middle = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2] as const;
    };
    // Where the bar sticks, not where it is before scrolling.
    const stuck = parseFloat(getComputedStyle(bar).top) + bar.getBoundingClientRect().height / 2;
    window.scrollBy(0, middle(restore)[1] - stuck);
    await new Promise(requestAnimationFrame);
    const lands = (el: HTMLElement) => bar.contains(document.elementFromPoint(...middle(el)));
    return {
      save: lands(save),
      restore: lands(restore),
      under: Math.abs(middle(restore)[1] - stuck) < 2,
    };
  });
  expect(hits).toEqual({ save: true, restore: true, under: true });
});
