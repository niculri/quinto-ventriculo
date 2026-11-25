// E2e tests of signed images that fail: an article's expired one signed again with a copy of the note (only its src
// changes), and one that fails anyway, in an article or a card, leaves a notice in its place with «Reintentar».
import { expect, test } from './test';
import type { Page, Route } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

const ARTICLE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const IMAGE = 'notes/0123456789abcdef0123456789abcdef.webp';
/** The back of the deck's first card. */
const CARD_IMAGE = 'cards/8f99a81cb163e77e829f2ad43f4ee7c4.webp';

// The API signs each link with the real time, and the page compares its expiry with its own clock.
test.use({ realClock: true });

const figure = (page: Page) => page.locator('.note-body figure').first();
const picture = (page: Page) => figure(page).locator('img');

/** The image drawn, and the expiry its URL carries. */
async function drawnExpiry(page: Page): Promise<number> {
  await expect
    .poll(() => picture(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
    .toBe(true);
  const src = await picture(page).evaluate((i: HTMLImageElement) => i.currentSrc);
  return Number(new URL(src).searchParams.get('e'));
}

test('an expired image is signed again with its note: only its src changes', async ({ page }) => {
  let reads = 0;
  let release: () => void = () => undefined;
  const second = new Promise<void>((r) => (release = r));
  // The first answer of the note comes with its links already expired (the API refuses them, as when they expire).
  await page.route('**/api/notes/11-traduccion', async (route: Route) => {
    reads++;
    if (reads > 1) {
      await second;
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.text()).replace(/(\/api\/media\/[^?"]+\?e=)\d+/g, '$11000');
    const { etag: _, ...headers } = response.headers();
    await route.fulfill({ response, body, headers });
  });
  await signIn(page);
  await page.goto(ARTICLE);
  await figure(page).scrollIntoViewIfNeeded();
  await expect.poll(() => reads).toBe(2);
  // Before the new signatures arrive, the figure on screen is marked: the same element has to get them.
  await figure(page).evaluate((f) => f.setAttribute('data-kept', '1'));
  const top = await page.evaluate(() => window.scrollY);
  release();

  expect(await drawnExpiry(page)).toBeGreaterThan(Date.now() / 1000);
  await expect(figure(page)).toHaveAttribute('data-kept', '1');
  expect(await page.evaluate(() => window.scrollY)).toBe(top);
  await expect(page.getByText('No se pudo cargar la imagen')).toHaveCount(0);
});

test('an image that fails anyway leaves a notice in its place, and «Reintentar» brings it', async ({
  page,
}) => {
  let failing = true;
  await page.route(`**/api/media/${IMAGE}*`, (route: Route) =>
    failing ? route.abort() : route.continue(),
  );
  await signIn(page);
  await page.goto(ARTICLE);
  await figure(page).scrollIntoViewIfNeeded();
  const notice = page.getByRole('group', { name: 'Imagen: Ribosoma' });
  await expect(notice).toContainText('No se pudo cargar la imagen');
  const box = (await notice.boundingBox())!;
  const place = (await figure(page).boundingBox())!;
  expect(Math.round(box.width)).toBeLessThanOrEqual(Math.round(place.width));
  expect(box.height).toBeGreaterThan(0);

  failing = false;
  const retry = notice.getByRole('button', { name: 'Reintentar' });
  await retry.focus();
  await page.keyboard.press('Enter');
  await drawnExpiry(page);
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ampliar la imagen: Ribosoma' })).toBeFocused();
});

test('a card’s image that fails leaves a notice as wide as the card, not as its broken icon', async ({
  page,
}) => {
  await page.route(`**/api/media/${CARD_IMAGE}*`, (route: Route) => route.abort());
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  const back = page.getByRole('region', { name: 'Reverso de la tarjeta' });
  const notice = back.getByRole('group', { name: /^Imagen/ });
  await expect(notice).toContainText('No se pudo cargar la imagen');
  const box = (await notice.boundingBox())!;
  const card = (await back.boundingBox())!;
  expect(box.width).toBeGreaterThan(card.width / 2);
  const button = (await notice.getByRole('button', { name: 'Reintentar' }).boundingBox())!;
  expect(button.x).toBeGreaterThanOrEqual(box.x);
  expect(button.x + button.width).toBeLessThanOrEqual(box.x + box.width);
  expect(button.y + button.height).toBeLessThanOrEqual(box.y + box.height);
});
