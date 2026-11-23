// E2e tests of the images asked for ahead in a study session: the back's while the front is up, so that the turned card
// shows it from the cache, and the next cards' only when the browser does not save data.
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

const BACK_IMAGE = 'cards/8f99a81cb163e77e829f2ad43f4ee7c4.webp';
/** Only on a card of the extras, which comes up after the first one. */
const NEXT_IMAGE = 'cards/67ceea88be75a8bbe271da358969f336.webp';

/** The images the page got from the server, in order. */
function imagesFetched(page: Page): string[] {
  const urls: string[] = [];
  page.on('requestfinished', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/media/')) urls.push(url.pathname.slice('/api/media/'.length));
  });
  return urls;
}

function saveData(page: Page) {
  return page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
  });
}

const front = (page: Page) => page.getByRole('region', { name: 'Frente de la tarjeta' });
const back = (page: Page) => page.getByRole('region', { name: 'Reverso de la tarjeta' });

test('the back’s image is already in the cache when the card turns', async ({ page, context }) => {
  const fetched = imagesFetched(page);
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  await expect(front(page).locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await expect(front(page).locator('img')).toHaveCount(0);
  await expect.poll(() => fetched).toContain(BACK_IMAGE);
  await expect(front(page)).toBeVisible();

  // Without a network, the image can only come from the browser's cache.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  const image = back(page).locator('.imagen img');
  await expect
    .poll(() => image.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
    .toBe(true);
  await context.setOffline(false);
  expect(fetched.filter((key) => key === BACK_IMAGE)).toHaveLength(1);
});

async function openExtras(page: Page) {
  const fetched = imagesFetched(page);
  const cards: string[] = [];
  page.on('requestfinished', (r) => {
    if (new URL(r.url()).pathname.includes('/cards/')) cards.push(decodeURIComponent(r.url()));
  });
  await signIn(page);
  await page.goto('/semesters/1/courses/anatomia-1/anki/certamen-1');
  await page.getByRole('switch', { name: 'Incluir extras' }).click();
  await expect(page.getByRole('switch', { name: 'Incluir extras' })).toBeChecked();
  await page.goto(`${DECK_URL}/extras/study`);
  await expect(front(page)).toContainText('Anidado:');
  // The occlusion's content comes ahead: its images would be on their way from then on.
  await expect.poll(() => cards.some((u) => u.includes('oclusion-2'))).toBe(true);
  return fetched;
}

test('the next cards’ images come while the first one is up', async ({ page }) => {
  const fetched = await openExtras(page);
  await expect.poll(() => fetched).toContain(NEXT_IMAGE);
  await expect(front(page)).toContainText('Anidado:');
});

test('with the data saver the next cards’ images wait until their card comes up', async ({
  page,
}) => {
  await saveData(page);
  const fetched = await openExtras(page);
  await page.waitForTimeout(1000);
  expect(fetched).not.toContain(NEXT_IMAGE);
});
