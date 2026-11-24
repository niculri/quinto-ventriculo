// E2e tests of the image viewer: natural size, pinch, drag, double tap and keys, from a note, a card and a test.
import { expect, test } from './test';
import type { Locator, Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

const ARTICLE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';

const viewer = (page: Page) =>
  page.getByRole('dialog').filter({ has: page.getByTestId('image-stage') });
const stageImage = (page: Page) => page.getByTestId('image-stage').locator('img');

const scale = (page: Page) =>
  stageImage(page).evaluate((img) =>
    Number(/scale\(([\d.]+)\)/.exec(img.style.transform)?.[1] ?? 0),
  );

const imageBox = async (page: Page) => {
  const b = (await stageImage(page).boundingBox())!;
  return [b.x, b.y, b.width, b.height].map(Math.round);
};

/** Touch pointers, as a finger sends them: the same in Chromium and WebKit (no CDP, no multi-touch API). */
async function touch(stage: Locator, steps: { id: number; type: string; x: number; y: number }[]) {
  await stage.evaluate((el, list) => {
    const r = el.getBoundingClientRect();
    for (const s of list) {
      el.dispatchEvent(
        new PointerEvent(s.type, {
          pointerId: s.id,
          pointerType: 'touch',
          isPrimary: s.id === 1,
          clientX: r.left + s.x,
          clientY: r.top + s.y,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  }, steps);
}

async function pinchOut(page: Page) {
  const stage = page.getByTestId('image-stage');
  const { width, height } = (await stage.boundingBox())!;
  const cx = width / 2;
  const cy = height / 2;
  await touch(stage, [
    { id: 1, type: 'pointerdown', x: cx - 20, y: cy },
    { id: 2, type: 'pointerdown', x: cx + 20, y: cy },
  ]);
  for (let i = 1; i <= 5; i++) {
    await touch(stage, [
      { id: 1, type: 'pointermove', x: cx - 20 - i * 16, y: cy },
      { id: 2, type: 'pointermove', x: cx + 20 + i * 16, y: cy },
    ]);
  }
  await touch(stage, [
    { id: 1, type: 'pointerup', x: cx - 100, y: cy },
    { id: 2, type: 'pointerup', x: cx + 100, y: cy },
  ]);
}

async function drag(page: Page, dx: number, dy: number) {
  const stage = page.getByTestId('image-stage');
  const { width, height } = (await stage.boundingBox())!;
  const x = width / 2;
  const y = height / 2;
  await touch(stage, [{ id: 1, type: 'pointerdown', x, y }]);
  for (let i = 1; i <= 4; i++) {
    await touch(stage, [{ id: 1, type: 'pointermove', x: x + (dx * i) / 4, y: y + (dy * i) / 4 }]);
  }
  await touch(stage, [{ id: 1, type: 'pointerup', x: x + dx, y: y + dy }]);
}

async function doubleTap(page: Page) {
  const stage = page.getByTestId('image-stage');
  const { width, height } = (await stage.boundingBox())!;
  const p = { x: width / 2, y: height / 2 };
  for (let i = 0; i < 2; i++) {
    await touch(stage, [
      { id: 1, type: 'pointerdown', ...p },
      { id: 1, type: 'pointerup', ...p },
    ]);
  }
}

test('from a note: fitted, pinch, drag, double tap, keys; closing goes back where it was', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(ARTICLE);
  const figure = page.getByRole('button', { name: 'Ampliar la imagen: Ribosoma' });
  await figure.scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  await figure.click();

  const dialog = viewer(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Ribosoma' })).toBeAttached();
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await expect(dialog).toHaveAccessibleDescription('Un ribosoma');
  await expect.poll(() => scale(page)).toBeGreaterThan(0);
  const fitted = await scale(page);
  // The test image is 640 px wide: at most its natural size, and the whole image in sight.
  expect(fitted).toBeLessThanOrEqual(1);
  await expect(dialog.getByRole('button', { name: 'Alejar' })).toBeDisabled();

  await pinchOut(page);
  await expect.poll(() => scale(page)).toBeGreaterThan(fitted * 1.5);
  const before = await imageBox(page);
  await drag(page, 60, 40);
  await expect.poll(() => imageBox(page)).not.toEqual(before);
  await doubleTap(page);
  await expect.poll(() => scale(page)).toBeCloseTo(fitted, 3);

  await page.keyboard.press('+');
  await expect.poll(() => scale(page)).toBeGreaterThan(fitted);
  await page.keyboard.press('0');
  await expect.poll(() => scale(page)).toBeCloseTo(fitted, 3);
  await dialog.getByRole('button', { name: 'Acercar', exact: true }).click();
  await expect.poll(() => scale(page)).toBeGreaterThan(fitted);
  await dialog.getByRole('button', { name: 'Ajustar a la pantalla' }).click();
  await expect.poll(() => scale(page)).toBeCloseTo(fitted, 3);

  await page.keyboard.press('+');
  const zoomOut = dialog.getByRole('button', { name: 'Alejar' });
  await zoomOut.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
  await expect(zoomOut).toBeDisabled();
  await expect(zoomOut).toBeFocused();
  await page.keyboard.press('+');
  await expect.poll(() => scale(page)).toBeGreaterThan(fitted);
  await page.keyboard.press('0');

  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(figure).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  await page.keyboard.press('Enter');
  await expect(viewer(page)).toBeVisible();
});

test('a tall plate opens at least as big as in the article, from its top, and still fits on request', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 800 });
  await signIn(page);
  await page.goto('/dev/reading');
  const plate = page.getByRole('button', {
    name: /^Ampliar la imagen: La escala de los potenciales, como/,
  });
  await plate.scrollIntoViewIfNeeded();
  const inArticle = (await plate.boundingBox())!;
  await plate.click();
  await expect.poll(() => scale(page)).toBeGreaterThan(0);
  const opened = (await stageImage(page).boundingBox())!;
  const stage = (await page.getByTestId('image-stage').boundingBox())!;
  expect(opened.width).toBeGreaterThanOrEqual(Math.floor(inArticle.width));
  // Taller than the stage it opens from its top; at the article's side it may fit, and then it is centered.
  const taller = opened.height >= stage.height - 1;
  if (taller) expect(Math.round(opened.y)).toBe(Math.round(stage.y));
  else expect(opened.y).toBeGreaterThanOrEqual(stage.y);
  expect(opened.x + opened.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
  // On a phone the article's column is narrower than what fits: it opens fitted, as before.
  if (!isMobile && taller)
    await viewer(page).getByRole('button', { name: 'Ajustar a la pantalla' }).click();
  await expect
    .poll(async () => (await imageBox(page))[3])
    .toBeLessThanOrEqual(Math.ceil(stage.height));
});

test('a real double tap zooms in once, also where the browser adds a dblclick', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'a finger');
  await signIn(page);
  await page.goto(ARTICLE);
  await page.getByRole('button', { name: 'Ampliar la imagen: Ribosoma' }).click();
  await expect.poll(() => scale(page)).toBeGreaterThan(0);
  const fitted = await scale(page);
  const box = (await page.getByTestId('image-stage').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.touchscreen.tap(center.x, center.y);
  await page.touchscreen.tap(center.x, center.y);
  await expect.poll(() => scale(page)).toBeGreaterThan(fitted * 1.2);
});

test('from a card being studied: its image, and closing leaves the card as it was', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  const back = page.getByRole('region', { name: 'Reverso de la tarjeta' });
  const image = back.locator('.imagen img');
  await expect
    .poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  const scroller = page.locator('.qv-scroll');
  await image.scrollIntoViewIfNeeded();
  const top = await scroller.evaluate((e) => e.scrollTop);
  await image.click();
  await expect(viewer(page)).toBeVisible();
  await expect.poll(() => scale(page)).toBeGreaterThan(0);
  await page.keyboard.press('3');
  await expect(viewer(page)).toBeVisible();
  await viewer(page).getByRole('button', { name: 'Cerrar' }).click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(back).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Responder' }).getByRole('button', { name: /^Bien/ }),
  ).toBeVisible();
  expect(await scroller.evaluate((e) => e.scrollTop)).toBe(top);
});

test('from an occlusion: the zoom keeps its masks, and the front stays the front', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(
    `/semesters/1/courses/anatomia-1/anki/certamen-1/cards?view=table&q=${encodeURIComponent('"Vértebra de prueba"')}`,
  );
  await page
    .getByRole('grid', { name: 'Tarjetas' })
    .getByRole('row', { name: /Vértebra de prueba/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Ver en grande/ }).click();
  // The card of the viewer, not the cards page's own preview behind it: before the page is hidden from the roles the
  // query finds that one, and the viewer's card is what covers it, so the click is never theirs.
  const front = page.getByRole('dialog').getByRole('region', { name: 'Frente de la tarjeta' });
  await expect(front.locator('#image-occlusion-canvas')).toBeVisible();
  await expect
    .poll(() =>
      front
        .locator('#image-occlusion-container img')
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0);
  await front.locator('#image-occlusion-canvas').click({ position: { x: 5, y: 5 } });

  await expect(viewer(page)).toBeVisible();
  const zoomed = stageImage(page);
  await expect(zoomed).toHaveAttribute('src', /^data:image\/png/);
  const masked = await zoomed.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(Math.round(0.14 * c.width), Math.round(0.1 * c.height), 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  expect(masked).toEqual([255, 123, 114]);

  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  await expect(front).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reverso de la tarjeta' })).toHaveCount(0);
  // The card viewer is still open: Escape closed only the zoom.
  await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();
});

test('from a test’s photo: closing leaves the question unanswered', async ({ page }) => {
  await signIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  const photo = page.getByRole('button', { name: /Ampliar la imagen: Foto de prueba/ });
  for (let i = 0; i < 3 && !(await photo.isVisible()); i++) {
    await page.getByRole('button', { name: 'Saltar' }).click();
  }
  // From the keyboard (Safari does not focus a button it was clicked on).
  await photo.focus();
  await page.keyboard.press('Enter');
  await expect(viewer(page)).toBeVisible();
  await expect.poll(() => scale(page)).toBeGreaterThan(0);
  await page.keyboard.press('1');
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  await expect(photo).toBeFocused();
  await expect(page.getByText(/^(Correcta|Incorrecta)/)).toHaveCount(0);
});
