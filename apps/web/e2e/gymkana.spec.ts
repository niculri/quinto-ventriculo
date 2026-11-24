// E2e tests of the gymkana: its card on the course's page, its page, a round of writing the name (that moves
// nothing when the verdict comes, survives a reload and never touches the cards' dates) and reporting a station.
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

const COURSE = '/semesters/2/courses/anatomia-2';
const GYMKANA = `${COURSE}/assessments/certamen-2/gymkana`;

async function watchShifts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __shift: number };
    w.__shift = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number })[]) {
        w.__shift += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: false });
  });
}
const shifts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shift: number }).__shift);

/** «Estación 1 de 2» on a computer, «1 / 2» on a phone. */
const station = (page: Page, i: number, n: number) =>
  page.getByText(new RegExp(`^(Estación ${i} de ${n}|${i} / ${n})$`)).filter({ visible: true });

const studyRows = (page: Page) =>
  page.evaluate(() => [
    localStorage.getItem('qv-demo-study'),
    localStorage.getItem('qv-demo-cards'),
  ]);

test('the gymkana from the course: its card, its page and a round written, reloaded and finished', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(COURSE);
  const card = page.getByRole('link', { name: /^Gymkana.*6 estaciones/ });
  await card.click();
  await expect(page).toHaveURL(GYMKANA);
  await expect(page.getByRole('heading', { level: 1, name: 'Gymkana' })).toBeVisible();
  await expect(page.getByText('6 estaciones · 4 son de prioridad 1')).toBeVisible();
  await expect(page.getByText('4 estaciones elegidas')).toBeVisible();
  const before = await studyRows(page);

  await page.getByRole('switch', { name: 'Cuello' }).click();
  await expect(page.getByText('2 estaciones elegidas')).toBeVisible();
  await page.getByRole('button', { name: 'Comenzar' }).click();
  await expect(page).toHaveURL(`${GYMKANA}/write`);
  await expect(station(page, 1, 2)).toBeVisible();

  // The photo is there before answering; the verdict comes under it and nothing moves.
  const box = page.getByRole('textbox', { name: 'Tu respuesta' });
  await expect(box).toBeFocused();
  await page.waitForTimeout(300);
  await watchShifts(page);
  await box.fill('algo que no es');
  await box.press('Enter');
  await expect(page.getByText('✗ Mala')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente estación' })).toBeFocused();
  expect(await shifts(page)).toBe(0);
  await page.getByRole('button', { name: 'Contarla como buena' }).click();
  await expect(page.getByText(/Buena \(la corregiste tú\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente estación' }).click();
  await expect(station(page, 2, 2)).toBeVisible();

  await page.reload();
  await expect(station(page, 2, 2)).toBeVisible();
  await page.getByRole('textbox', { name: 'Tu respuesta' }).fill('n optico');
  await page.getByRole('button', { name: 'Responder' }).click();
  await page.getByRole('button', { name: 'Ver el resultado' }).click();
  await expect(page.getByRole('heading', { name: /de 2 buenas$/ })).toBeVisible();

  // A round of writing is not studying: the cards' rows and the deck's switch are as they were.
  expect(await studyRows(page)).toEqual(before);
  await page.getByRole('link', { name: 'Otra ronda' }).click();
  await expect(page).toHaveURL(GYMKANA);
  await expect(page.getByText(/^Tu última ronda: \d de 2 buenas\.$/)).toBeVisible();
});

test('a station can be reported with its code', async ({ page }) => {
  await signIn(page);
  await page.goto(GYMKANA);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  await expect(
    page.getByText(/^(Estación 1 de \d|1 \/ \d)$/).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('menuitem', { name: 'Reportar error' }).click();
  const dialog = page.getByRole('dialog', { name: /Reportar error/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/T-PR-G2-000\d\.1/);
});

test('the gymkana turns on as a unit of its assessment', async ({ page }) => {
  await signIn(page);
  await page.goto(GYMKANA);
  const on = page.getByRole('switch', { name: 'Activada en tu Anki' });
  await expect(on).not.toBeChecked();
  await on.click();
  await expect(on).toBeChecked();
  await page.getByRole('link', { name: 'Estudiar' }).click();
  await expect(page).toHaveURL(`${COURSE}/anki/certamen-2/gymkana/study`);
  await expect(page.getByText('¿Qué estructura señala el alfiler rojo?')).toBeVisible();
});
