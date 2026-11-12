import { expect, test } from './test';
import { ONLY_ACCEPTED } from './accepted';
import type { Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

/**
 * Step 3.4: the summary of «Listo por hoy» (ANK-15) and «Opciones» without «Retención histórica» and with the FSRS
 * parameters read-only (ANK-14). The summary has its place from the first frame: its figures arrive late (the demo's
 * heatmap, `qv-demo-heatmap=slow`, 1.5 s) without moving anything, and it fits on the phone.
 */
test.use({ storageState: ONLY_ACCEPTED });

const ASSESSMENT_URL = '/semesters/1/courses/anatomia-1/anki/certamen-1';
const front = (page: Page) => page.getByRole('region', { name: 'Frente de la tarjeta' });
const done = (page: Page) => page.getByRole('heading', { name: 'Listo por hoy' });

/** Counts the layout shifts after `settle()` (as heatmap.spec.ts). */
async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { shift_: number; from_: number };
    w.shift_ = 0;
    w.from_ = Number.POSITIVE_INFINITY;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        startTime: number;
        hadRecentInput: boolean;
      }[]) {
        if (!e.hadRecentInput && e.startTime > w.from_) w.shift_ += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (window as unknown as { from_: number }).from_ = performance.now();
            resolve();
          }),
        ),
      ),
  );
const shift = (page: Page) => page.evaluate(() => (window as unknown as { shift_: number }).shift_);

/** A week on, three new cards a day, and the welcome already seen. */
async function ready(page: Page) {
  await signIn(page);
  await page.goto(ASSESSMENT_URL);
  await page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' }).click();
  const number = page
    .getByRole('region', { name: 'Opciones de Certamen 1' })
    .getByRole('spinbutton', { name: 'Tarjetas nuevas por día' });
  await number.fill('3');
  await number.press('Enter');
  await expect(number).toHaveValue('3');
  await page.goto(`${DECK_URL}/study`);
  const welcome = page.getByRole('dialog', { name: 'Cómo se estudia aquí' });
  await welcome.getByRole('button', { name: 'Entendido' }).click();
  await expect(welcome).toHaveCount(0);
}

/** The first card «Otra vez», the others «Bien», up to «Listo por hoy». */
async function studyToTheEnd(page: Page, failOne = true) {
  const answer = page.getByRole('group', { name: 'Responder' });
  for (let i = 0; i < 30; i++) {
    await expect(done(page).or(front(page))).toBeVisible();
    if (await done(page).isVisible()) return;
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await answer.getByRole('button', { name: failOne && i === 0 ? /^Otra vez/ : /^Bien/ }).click();
  }
  throw new Error('It never ended');
}

test('«Listo por hoy» says today’s answers, «% bien» and the streak, and nothing moves when they arrive', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('qv-demo-heatmap', 'slow'));
  await watchShifts(page);
  await ready(page);
  await studyToTheEnd(page);

  const box = page.getByRole('region', { name: 'Resumen de hoy' });
  await expect(box).toBeVisible();
  const where = async () =>
    page.evaluate(() => {
      const y = (e: Element | null) => (e ? Math.round(e.getBoundingClientRect().top) : null);
      return {
        heading: y(document.querySelector('h1')),
        box: y(document.querySelector('[aria-label="Resumen de hoy"]')),
        back: y(
          [...document.querySelectorAll('a')].find((a) => a.textContent === 'Volver al mazo')!,
        ),
      };
    });
  // Before the figures arrive (1.5 s late).
  await settle(page);
  const before = await where();
  // The figures are not there yet: their places are.
  await expect(box.locator('dd').first()).toHaveText('');
  const figure = (label: string) =>
    box.getByText(label, { exact: true }).locator('xpath=following-sibling::dd[1]');
  await expect(figure('Racha actual')).toHaveText(/^\d+ días?$/);
  // Under it, the course's streak, in its own line that was already there.
  await expect(
    box.getByText('Racha actual', { exact: true }).locator('xpath=following-sibling::dd[2]'),
  ).toHaveText(/^\d+ en el ramo$/);
  await expect(figure('Respuestas hoy')).toHaveText(/^\d+$/);
  const answers = Number(await figure('Respuestas hoy').textContent());
  expect(answers).toBeGreaterThanOrEqual(4);
  // One «Otra vez» among them.
  await expect(figure('Bien')).toHaveText(`${Math.round(((answers - 1) / answers) * 100)} %`);
  expect(await where()).toEqual(before);
  expect(await shift(page)).toBe(0);

  // It fits: on the phone too, without scrolling sideways.
  const vw = page.viewportSize()!.width;
  const rect = (await box.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(vw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);

  // At 375 × 667 (a small phone, narrower than the projects' ones): nothing cut, nothing sideways, and the heading
  // still below the bar above (Revisión de cero, 3.4).
  await page.setViewportSize({ width: 375, height: 667 });
  const fits = await box.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      cut: [...el.querySelectorAll('dt, dd')].some((e) => e.scrollWidth > e.clientWidth),
    };
  });
  expect(fits.left).toBeGreaterThanOrEqual(0);
  expect(fits.right).toBeLessThanOrEqual(375);
  expect(fits.cut).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const bar = (await page.getByRole('link', { name: /^Volver a Anatomía/ }).boundingBox())!;
  expect((await done(page).boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height);

  // «Ver las que fallaste»: today's failed card, in the cards of the assessment.
  await box.getByRole('link', { name: 'Ver las que fallaste' }).click();
  await expect(page).toHaveURL(/\/anki\/certamen-1\/cards\?.*state=failed/);
  await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByText('1 nota · 1 tarjeta')).toBeVisible();
  // The deck studied, chosen in «Semana o clase» (its week has only that deck: the list did not offer it).
  await expect(
    page.getByRole('button', { name: 'Semana o clase: S1 - Semana de prueba › Mazo de prueba' }),
  ).toBeVisible();
});

test('without a card failed there is no «Ver las que fallaste»; the final review has no summary', async ({
  page,
}) => {
  await ready(page);
  await studyToTheEnd(page, false);
  const box = page.getByRole('region', { name: 'Resumen de hoy' });
  await expect(
    box.getByText('Bien', { exact: true }).locator('xpath=following-sibling::dd[1]'),
  ).toHaveText('100 %');
  await expect(box.getByRole('link')).toHaveCount(0);

  await page.getByRole('link', { name: 'Repasar igual, sin cambiar fechas' }).click();
  await page.getByRole('button', { name: /^Todo lo visto/ }).click();
  const answer = page.getByRole('group', { name: 'Responder' });
  for (let i = 0; i < 20 && !(await page.getByText('Terminaste el repaso').isVisible()); i++) {
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await answer.getByRole('button', { name: 'Bien' }).click();
    await expect(page.getByText('Terminaste el repaso').or(front(page))).toBeVisible();
  }
  await expect(page.getByText('Terminaste el repaso')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumen de hoy' })).toHaveCount(0);
});

test('«Opciones»: no «Retención histórica», and the FSRS parameters are read-only', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/anki');
  await page.getByRole('switch', { name: /Modo avanzado/ }).check();
  await expect(page.getByRole('switch', { name: /Modo avanzado/ })).toBeChecked();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.goto('/settings/deck-options');
  const params = page.getByRole('group', { name: 'Parámetros FSRS' });
  await expect(params.getByLabel('Parámetros predeterminados')).toContainText('0.212');
  await expect(params.getByRole('textbox')).toHaveCount(0);
  await expect(params.getByRole('button')).toHaveCount(0);
  await expect(page.getByText('Retención histórica')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Optimizar' })).toHaveCount(0);
  const vw = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
});
