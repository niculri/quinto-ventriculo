import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { DECK_URL, scrollCard, signIn } from './helpers';

/** The browser («Buscar tarjetas») with a search; `card` opens that row in «Ver en grande». */
async function browse(page: Page, query: string, row: RegExp) {
  await signIn(page);
  await page.goto(`/anki/browse?q=${encodeURIComponent(query)}`);
  const grid = page.getByRole('grid', { name: 'Tarjetas' });
  await grid.getByRole('row', { name: row }).first().click();
  await page.getByRole('button', { name: /Ver en grande/ }).click();
  return page.getByRole('dialog');
}

/** Color of a pixel of the occlusion canvas, at a point given in fractions of the image. */
async function pixel(viewer: Locator, x: number, y: number) {
  return viewer.locator('#image-occlusion-canvas').evaluate(
    (canvas: HTMLCanvasElement, [fx, fy]) => {
      const d = canvas
        .getContext('2d')!
        .getImageData(Math.round(fx! * canvas.width), Math.round(fy! * canvas.height), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    [x, y],
  );
}

test('a basic card: front, answer, and the footer stays inside the viewer', async ({ page }) => {
  const dialog = await browse(
    page,
    '',
    /¿Cuántas vértebras cervicales hay\? T-PR-01-001.2 Directa/,
  );
  await expect(dialog.getByText(/^Básica · \d+ de 16$/)).toBeVisible();
  const front = dialog.getByRole('region', { name: 'Frente de la tarjeta' });
  await expect(front.locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await expect(front.locator('.respuesta')).toHaveCount(0);

  // The note type CSS applies inside the shadow root, and not outside it.
  await expect(front.locator('b').first()).toHaveCSS('color', 'rgb(26, 100, 214)');

  // The «position: fixed» footer is at the bottom right of the card, not of the window.
  const pie = await front.locator('.pie').boundingBox();
  const box = await front.boundingBox();
  expect(pie!.x + pie!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
  expect(pie!.y + pie!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);

  // The hint opens with a click.
  await front.getByText('Pista').click();
  await expect(front.getByText('Empieza con 7')).toBeVisible();

  await dialog.getByRole('button', { name: 'Mostrar respuesta' }).click();
  const back = dialog.getByRole('region', { name: 'Reverso de la tarjeta' });
  await expect(back.locator('.respuesta')).toHaveText('7');
  const image = back.locator('.imagen img');
  await expect
    .poll(() => image.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
    .toBeGreaterThan(0);
});

test('a cloze card: [...] on the front, the answer highlighted on the back', async ({ page }) => {
  const dialog = await browse(page, 'note:"Prueba · Cloze"', /T-PR-01-003\.1 Cloze 2/);
  const front = dialog.getByRole('region', { name: 'Frente de la tarjeta' });
  await expect(front.locator('.cloze')).toHaveText('[número]');
  await page.keyboard.press('Space');
  const back = dialog.getByRole('region', { name: 'Reverso de la tarjeta' });
  await expect(back.locator('.cloze')).toHaveText('12');
  await expect(back.locator('.cloze-inactive').first()).toHaveText('7');
  // Next card with the arrow.
  await page.keyboard.press('ArrowRight');
  await expect(
    dialog.getByRole('region', { name: 'Frente de la tarjeta' }).locator('.cloze'),
  ).toHaveText('[...]');
});

test('an occlusion card is drawn like Anki: masks, highlight and «toggle»', async ({ page }) => {
  // The first «Vértebra de prueba» card is gap 1 of that occlusion (its cards in order).
  const dialog = await browse(page, '"Vértebra de prueba"', /Vértebra de prueba/);
  await expect(dialog.getByText(/hueco 1$/)).toBeVisible();
  const front = dialog.getByRole('region', { name: 'Frente de la tarjeta' });
  await expect(front.locator('#image-occlusion-canvas')).toBeVisible();
  // c1 (active) in the active color; c2 (inactive, «hide all») in the inactive color.
  await expect.poll(() => pixel(front, 0.14, 0.1)).toEqual([255, 123, 114, 255]);
  expect(await pixel(front, 0.5, 0.46)).toEqual([255, 224, 138, 255]);
  // c6 has no «hide all»: it is not covered.
  expect((await pixel(front, 0.5, 0.8))[3]).toBe(0);

  await dialog.getByRole('button', { name: 'Mostrar respuesta' }).click();
  const back = dialog.getByRole('region', { name: 'Reverso de la tarjeta' });
  // The active mask is uncovered (transparent fill), the others stay.
  // (Both polled: until the back is drawn, its canvas is all transparent.)
  await expect.poll(() => pixel(back, 0.5, 0.46)).toEqual([255, 224, 138, 255]);
  await expect.poll(() => pixel(back, 0.14, 0.1)).toEqual([0, 0, 0, 0]);
  await back.locator('#toggle').click();
  await expect.poll(async () => (await pixel(back, 0.5, 0.46))[3]).toBe(0);
});

test('dark mode: the card gets nightMode and its dark colors', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qv-theme', 'dark'));
  const dialog = await browse(
    page,
    '',
    /¿Cuántas vértebras cervicales hay\? T-PR-01-001.2 Directa/,
  );
  const front = dialog.getByRole('region', { name: 'Frente de la tarjeta' });
  await expect(front.locator('.card')).toHaveClass('card card1 nightMode night_mode');
  // As Anki's «body.nightMode», with the site's dark colors: it beats the note type's bare «.card» rule (#1c1f24
  // there), not its «.card.nightMode» ones; the note type's variables of the night mode still apply.
  await expect(front.locator('.card')).toHaveCSS('background-color', 'rgb(20, 29, 33)');
  await expect(front.locator('.card')).toHaveCSS('color', 'rgb(234, 241, 242)');
  await expect(front.locator('b').first()).toHaveCSS('color', 'rgb(110, 168, 255)');
});

test('the footer stays at the bottom of the viewer while a long card scrolls, as in Anki', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 420 });
  await browse(page, '', /¿Cuántas vértebras cervicales hay\? T-PR-01-001.2 Directa/);
  await page.getByRole('dialog').getByRole('button', { name: 'Mostrar respuesta' }).click();
  const back = page.getByRole('dialog').getByRole('region', { name: 'Reverso de la tarjeta' });
  const scroller = back.locator('.qv-scroll');
  await expect
    .poll(() => scroller.evaluate((e) => e.scrollHeight - e.clientHeight))
    .toBeGreaterThan(50);
  const before = (await back.locator('.pie').boundingBox())!;
  const box = (await back.boundingBox())!;
  expect(Math.abs(before.y + before.height - (box.y + box.height))).toBeLessThan(12);
  await scroller.evaluate((e) => e.scrollTo(0, e.scrollHeight));
  const after = (await back.locator('.pie').boundingBox())!;
  expect(after.y).toBeCloseTo(before.y, 0);
});

test('the wheel and a finger scroll a long card inside the viewer', async ({ page }, info) => {
  await page.setViewportSize({ width: 700, height: 420 });
  await browse(page, '', /¿Cuántas vértebras cervicales hay\? T-PR-01-001.2 Directa/);
  await page.getByRole('dialog').getByRole('button', { name: 'Mostrar respuesta' }).click();
  const back = page.getByRole('dialog').getByRole('region', { name: 'Reverso de la tarjeta' });
  await scrollCard(page, back, info.project.name === 'phone' ? 'finger' : 'wheel');
});

test('the old URLs of a deck and its subdeck go to their place in the tree', async ({ page }) => {
  await signIn(page);
  await page.goto('/decks/2059400110?subdeck=extras');
  // A deck inside a week or lecture has no page of its own: its assessment's.
  await expect(page).toHaveURL(/\/anki\/certamen-1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Certamen 1' })).toBeVisible();
  await page.goto('/semesters/1/courses/anatomia-1/anki/mazo-de-prueba/study');
  await expect(page).toHaveURL(new RegExp(`${DECK_URL}/study$`));
  await page.goto('/semesters/1/courses/anatomia-1/anki/mazo-de-prueba/options');
  await expect(page).toHaveURL(/\/settings\/deck-options\?preset=Default$/);
});

test('cards cannot be read without a session', async ({ page }) => {
  expect((await page.request.get('/api/decks/2059400110')).status()).toBe(401);
  expect((await page.request.get('/api/cards/cloze-1/0')).status()).toBe(401);
  expect((await page.request.get('/api/anki/notes')).status()).toBe(401);
});
