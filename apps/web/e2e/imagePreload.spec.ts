// E2e tests of the images asked for ahead in a study session: the back's while the front is up and the next cards' only
// when the browser does not save data, each with the very URL its card then shows, which goes to the network once.
import { expect, test } from './test';
import type { Locator, Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

const BACK_IMAGE = 'cards/8f99a81cb163e77e829f2ad43f4ee7c4.webp';
/** Only on the occlusion of the extras, which comes up after the first card of the extras. */
const NEXT_IMAGE = 'cards/67ceea88be75a8bbe271da358969f336.webp';

/**
 * The images that came from the server, with their signed query, and the ones of them that arrived whole: an image the
 * browser takes from its memory or its HTTP cache is not there, and two signatures of one image are two entries.
 * Chromium's protocol tells a cache hit apart; Playwright reports one from the HTTP cache as a request too.
 */
async function imageTraffic(page: Page) {
  const fetched: string[] = [];
  const arrived: string[] = [];
  const byRequest = new Map<string, string>();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    const url = new URL(response.url);
    if (!url.pathname.startsWith('/api/media/') || response.fromDiskCache) return;
    fetched.push(url.pathname + url.search);
    byRequest.set(requestId, url.pathname + url.search);
  });
  cdp.on('Network.loadingFinished', ({ requestId }) => {
    const url = byRequest.get(requestId);
    if (url) arrived.push(url);
  });
  return { fetched, arrived };
}

const keyOf = (url: string) =>
  new URL(url, 'http://localhost').pathname.slice('/api/media/'.length);
const fetchesOf = (urls: string[], key: string) => urls.filter((url) => keyOf(url) === key);

/** The URL an image shows, once it is drawn. */
async function drawn(image: Locator): Promise<string> {
  await expect
    .poll(() => image.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
    .toBe(true);
  const url = new URL(await image.evaluate((i: HTMLImageElement) => i.currentSrc));
  return url.pathname + url.search;
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
  const traffic = await imageTraffic(page);
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  await expect(front(page).locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await expect(front(page).locator('img')).toHaveCount(0);
  await expect.poll(() => traffic.arrived.map(keyOf)).toContain(BACK_IMAGE);
  await expect(front(page)).toBeVisible();

  // Without a network, the image can only come from the browser's cache.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  const url = await drawn(back(page).locator('.imagen img'));
  await context.setOffline(false);
  expect(fetchesOf(traffic.fetched, BACK_IMAGE)).toEqual([url]);

  // An undo brings the card back: neither its warm-up nor its back go to the network again.
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Bien/ })
    .click();
  await expect(front(page)).toContainText('Pregunta sin extra ni pista');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(front(page).locator('.pregunta')).toHaveText('¿Cuántas vértebras cervicales hay?');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  expect(await drawn(back(page).locator('.imagen img'))).toBe(url);
  expect(fetchesOf(traffic.fetched, BACK_IMAGE)).toEqual([url]);
});

async function openExtras(page: Page) {
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
}

/** Answers «Bien» until the occlusion is up, and gives its image. */
async function untilOcclusion(page: Page): Promise<Locator> {
  const image = front(page).locator('#image-occlusion-container img');
  for (let answered = 0; answered < 3 && (await image.count()) === 0; answered++) {
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await expect(back(page)).toBeVisible();
    await page
      .getByRole('group', { name: 'Responder' })
      .getByRole('button', { name: /^Bien/ })
      .click();
    await expect(front(page)).toBeVisible();
  }
  await expect(image).toHaveCount(1);
  return image;
}

test('the next cards’ images come while the first one is up, and their card shows them from the cache', async ({
  page,
}) => {
  const traffic = await imageTraffic(page);
  await openExtras(page);
  await expect.poll(() => traffic.arrived.map(keyOf)).toContain(NEXT_IMAGE);
  await expect(front(page)).toContainText('Anidado:');
  const url = await drawn(await untilOcclusion(page));
  expect(fetchesOf(traffic.fetched, NEXT_IMAGE)).toEqual([url]);
});

test('with the data saver the next cards’ images wait until their card comes up', async ({
  page,
}) => {
  await saveData(page);
  const traffic = await imageTraffic(page);
  await openExtras(page);
  await page.waitForTimeout(1000);
  expect(fetchesOf(traffic.fetched, NEXT_IMAGE)).toEqual([]);
  const url = await drawn(await untilOcclusion(page));
  expect(fetchesOf(traffic.fetched, NEXT_IMAGE)).toEqual([url]);
});
