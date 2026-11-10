import { expect, test } from './test';
import { ONLY_ACCEPTED } from './accepted';
import type { Locator, Page } from '@playwright/test';
import { signIn } from './helpers';

/** A student who just arrived: without the preferences the other tests start with. */
test.use({ storageState: ONLY_ACCEPTED });

const COURSE_URL = '/semesters/1/courses/anatomia-1';
const ASSESSMENT_URL = `${COURSE_URL}/anki/certamen-1`;
const WEEK = 'Activar S1 - Semana de prueba';

const front = (page: Page) => page.getByRole('region', { name: 'Frente de la tarjeta' });
const back = (page: Page) => page.getByRole('region', { name: 'Reverso de la tarjeta' });

/** The site's day starts at 4:00 (the default «Next day starts at»), in the browser's time zone. */
const DAY_STARTS_AT = 4;

/**
 * The date `days` days after the site's today. Before 4:00 the site's today is still yesterday, so the plain calendar
 * day failed between 0:00 and 4:00 («Faltan 16 días» instead of 15). The browser and this process share the time zone.
 */
const inDays = (days: number) => {
  const d = new Date(Date.now() - DAY_STARTS_AT * 3_600_000);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const top = async (l: Locator) => (await l.boundingBox())!.y;

/** Everything that can move below the options, in the page (not in the window). */
const positions = (page: Page) =>
  page.evaluate(() => {
    const y = (e: Element | null) =>
      e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
    return {
      options: Math.round(
        document.querySelector('[aria-label="Opciones de Certamen 1"]')!.getBoundingClientRect()
          .height,
      ),
      study: y(document.querySelector('[aria-label="Estudiar"]')),
      list: y(document.querySelector('ul[aria-label="Submazos"]')),
      review: y(
        document.querySelector('[aria-label="Estudiar"] a[href$="/review"]') ??
          [...document.querySelectorAll('[aria-label="Estudiar"] button')].find((b) =>
            b.textContent?.includes('Repaso final'),
          ) ??
          null,
      ),
    };
  });

/** A student who already answered the first cards. */
async function answerAll(page: Page) {
  const answer = page.getByRole('group', { name: 'Responder' });
  for (let i = 0; i < 30; i++) {
    const done = page.getByRole('heading', { name: 'Listo por hoy' });
    const shown = front(page);
    await expect(done.or(shown)).toBeVisible();
    if (await done.isVisible()) return;
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await expect(back(page)).toBeVisible();
    await answer.getByRole('button', { name: /^Bien/ }).click();
  }
  throw new Error('It never ended');
}

test('a student turns on a week, puts a date, sees the pace, studies and reviews without changing dates', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(ASSESSMENT_URL);
  await page.getByRole('switch', { name: WEEK }).click();
  const options = page.getByRole('region', { name: 'Opciones de Certamen 1' });
  const number = options.getByRole('spinbutton', { name: 'Tarjetas nuevas por día' });
  await expect(number).toBeEnabled();
  await expect(options.getByRole('status')).toHaveCount(0);

  // The date: the number is computed, and says so.
  await options.getByLabel('Fecha de la prueba').fill(inDays(15));
  await expect(number).toBeDisabled();
  await expect(options.getByRole('status')).toContainText('Faltan 15 días');
  await expect(options).toContainText('Lo calcula el sitio con tu fecha');
  const three = options.locator('label', { hasText: '3 días' });
  await expect(three).toContainText(/\d+\s*(nuevas? )?al día/);
  await expect(three).toContainText(/~\d+ min/);

  // «N para hoy» is the number.
  await expect(number).toHaveValue('1');
  const load = page.getByRole('group', { name: 'Para hoy' }).getByRole('button');
  await expect(load).toHaveText(/^1 para hoy/);

  // More days for reviewing, more new cards a day.
  await options.getByRole('radio', { name: '7 días solo para repasar' }).click();
  await expect(number).toHaveValue('2');
  await expect(load).toHaveText(/^2 para hoy/);

  // Close to the test, those days have already started.
  await options.getByLabel('Fecha de la prueba').fill(inDays(5));
  await expect(options.getByRole('status')).toContainText('días de repaso final');
  await expect(number).toHaveValue('0');
  await options.getByRole('radio', { name: '1 día solo para repasar' }).click();
  await expect(number).not.toHaveValue('0');
  await options.getByLabel('Fecha de la prueba').fill(inDays(15));
  await expect(options.getByRole('status')).toContainText('Faltan 15 días');

  // It stays.
  await page.reload();
  await expect(number).toBeDisabled();
  await expect(options.getByRole('radio', { name: '1 día solo para repasar' })).toBeChecked();

  // Studies.
  await page.goto(`${ASSESSMENT_URL}/study`);
  const welcome = page.getByRole('dialog', { name: 'Cómo se estudia aquí' });
  await welcome.getByRole('button', { name: 'Entendido' }).click();
  await expect(welcome).toHaveCount(0);
  await answerAll(page);

  // «Listo por hoy» goes to the final review.
  const saved = await page.evaluate(() => localStorage.getItem('qv-demo-study'));
  const rows = (s: string | null) => {
    const d = JSON.parse(s!) as { cards: unknown[]; log: unknown[] };
    return JSON.stringify([d.cards, d.log]);
  };
  await page.getByRole('link', { name: 'Repasar igual, sin cambiar fechas' }).click();
  await expect(page).toHaveURL(new RegExp(`${ASSESSMENT_URL}/review$`));
  // No menu, as studying.
  await expect(page.getByRole('navigation', { name: /menú/i })).toHaveCount(0);
  await expect(page.getByText('Este repaso no cambia las fechas de tus tarjetas.')).toBeVisible();

  await page.getByRole('button', { name: /^Todo lo visto/ }).click();
  await expect(front(page)).toBeVisible();
  await expect(page.getByText(/^Repaso final · quedan \d+$/)).toBeVisible();
  const answerBar = page.getByRole('group', { name: 'Responder' });
  const before = await top(answerBar);
  await page.keyboard.press('Space');
  await expect(back(page)).toBeVisible();
  // Nothing moves on showing the answer.
  expect(await top(answerBar)).toBe(before);
  await expect(answerBar.getByRole('button')).toHaveCount(2);
  await page.keyboard.press('1');
  await expect(front(page)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(back(page)).toBeVisible();
  await page.keyboard.press('2');

  // No answer touched the cards' states nor the log.
  expect(rows(await page.evaluate(() => localStorage.getItem('qv-demo-study')))).toBe(rows(saved));

  // One can leave whenever. The answers count as practice (the heatmap and the streak), and still no date moved.
  await page.getByRole('link', { name: 'Volver a Certamen 1' }).first().click();
  await expect(page).toHaveURL(new RegExp(`${ASSESSMENT_URL}$`));
  await expect
    .poll(async () => {
      const d = JSON.parse((await page.evaluate(() => localStorage.getItem('qv-demo-study')))!) as {
        practice?: { n: number }[];
      };
      return (d.practice ?? []).reduce((t, p) => t + p.n, 0);
    })
    .toBe(2);
  expect(rows(await page.evaluate(() => localStorage.getItem('qv-demo-study')))).toBe(rows(saved));
  await expect(page.getByRole('link', { name: 'Repaso final' })).toBeVisible();

  // On the course: dominio above 0 and the summary.
  await page.goto(COURSE_URL);
  await expect(page.getByText('Faltan 15 días · vas al día')).toBeVisible();
  await expect(page.locator('[data-mastery]').first()).not.toContainText(/^0 %/);
  // Its explanation only over the percentage, not over the whole card (a phone has no pointer: there, a touch).
  if (test.info().project.name !== 'phone') {
    const meter = page.locator('[data-mastery]').first();
    await expect(meter.getByRole('tooltip')).toBeHidden();
    await page
      .getByRole('link', { name: /Anki/ })
      .last()
      .hover({ position: { x: 12, y: 12 } });
    await expect(meter.getByRole('tooltip')).toBeHidden();
    await meter.hover();
    await expect(meter.getByRole('tooltip')).toBeVisible();
  }
  await page.goto('/home');
  await expect(page.getByText('Certamen 1 · Faltan 15 días · vas al día')).toBeVisible();
});

for (const width of [null, 320]) {
  test(`nothing moves below the options on turning a week on and off, with or without a date${width ? `, at ${width} px` : ''}`, async ({
    page,
  }) => {
    if (width) await page.setViewportSize({ width, height: 640 });
    await signIn(page);
    await page.goto(ASSESSMENT_URL);
    const options = page.getByRole('region', { name: 'Opciones de Certamen 1' });
    const field = options.getByLabel('Fecha de la prueba');
    await expect(
      options.getByRole('spinbutton', { name: 'Tarjetas nuevas por día' }),
    ).toBeEnabled();
    await expect(page.getByRole('switch', { name: WEEK })).toBeVisible();
    const start = await positions(page);

    const same = async (what: string) => {
      await page.waitForTimeout(50);
      expect(await positions(page), what).toEqual(start);
    };

    await page.getByRole('switch', { name: WEEK }).click();
    await expect(page.getByRole('group', { name: 'Para hoy' })).toContainText('para hoy');
    await same('turning a week on');

    await page.getByRole('switch', { name: WEEK }).click();
    await same('turning it off');

    // With a date its block is there (the owner's choice: hidden until there is a date), and a switch moves nothing.
    await field.fill(inDays(30));
    await expect(options.getByRole('status')).toContainText('Activa una semana');
    const withDate = await positions(page);
    await page.getByRole('switch', { name: WEEK }).click();
    await expect(options.getByRole('status')).toContainText('Faltan 30 días');
    await page.waitForTimeout(50);
    expect(await positions(page), 'turning a week on, with a date').toEqual(withDate);
    await options.getByRole('radio', { name: '7 días solo para repasar' }).click();
    await page.waitForTimeout(50);
    expect(await positions(page), 'choosing the days for reviewing').toEqual(withDate);

    // Taking the date away leaves everything where it was without one.
    await page.getByRole('switch', { name: WEEK }).click();
    await options.getByRole('button', { name: 'Sacar la fecha' }).click();
    await expect(options.getByRole('status')).toHaveCount(0);
    await same('taking it away');
  });
}

test('nothing jumps while the page loads', async ({ page }) => {
  await signIn(page);
  await page.goto(ASSESSMENT_URL);
  await page.getByRole('switch', { name: WEEK }).click();
  await page
    .getByRole('region', { name: 'Opciones de Certamen 1' })
    .getByLabel('Fecha de la prueba')
    .fill(inDays(12));
  await expect(page.getByRole('status').first()).toContainText('Faltan 12 días');

  const measure = async (url: string, ready: Locator) => {
    await page.addInitScript(() => {
      const w = window as unknown as { shift: number; shiftObserved?: boolean };
      // Revisión de cero (1.8): one observer per page. Each `measure` adds this script again, and every script runs on
      // every page: the third page counted each shift three times.
      if (w.shiftObserved) return;
      w.shiftObserved = true;
      w.shift = 0;
      type Rect = { x: number; y: number; width: number; height: number };
      const overlap = (a: Rect, b: Rect) =>
        Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      new PerformanceObserver((list) => {
        // Inside the page: the footer goes down as soon as anything long loads, on every page of the site.
        // Revisión de cero (1.8): the score of what moved inside the page, not the whole entry's. A web font that
        // arrives in the same frame as the content moves the title 3 px, and the entry also carried the footer
        // leaving the screen (a home taller than the window): 0.02 of the footer counted as a jump of the page.
        // As the browser's own score (impact × distance), with only the sources inside #content (it adds their areas,
        // so it can only count more than the browser would).
        const view = window.innerWidth * window.innerHeight;
        const far = Math.max(window.innerWidth, window.innerHeight);
        for (const e of list.getEntries() as unknown as {
          sources: { node: Node | null; previousRect: Rect; currentRect: Rect }[];
        }[]) {
          let area = 0;
          let distance = 0;
          for (const s of e.sources) {
            const el = s.node instanceof Element ? s.node : s.node?.parentElement;
            if (!el?.closest('#content')) continue;
            const p = s.previousRect;
            const c = s.currentRect;
            area += p.width * p.height + c.width * c.height - overlap(p, c);
            distance = Math.max(distance, Math.abs(c.x - p.x), Math.abs(c.y - p.y));
          }
          w.shift += Math.min(1, area / view) * (distance / far);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(url);
    await expect(ready).toBeVisible();
    await page.waitForTimeout(500);
    return page.evaluate(() => (window as unknown as { shift: number }).shift);
  };
  // Each one: as good as Chrome's own threshold for «no shift at all».
  expect(await measure(ASSESSMENT_URL, page.getByText('Faltan 12 días').first())).toBeLessThan(
    0.02,
  );
  expect(await measure(COURSE_URL, page.getByText('Faltan 12 días · vas al día'))).toBeLessThan(
    0.02,
  );
  expect(await measure('/home', page.getByText(/Certamen 1 · Faltan 12 días/))).toBeLessThan(0.02);
});

test('«Modo avanzado» keeps the page of the assessment, and adds a configuration for each deck', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/anki');
  await page.getByRole('switch', { name: /Modo avanzado/ }).check();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByLabel('Límite del estudio por adelantado')).toBeVisible();
  await page.goto(ASSESSMENT_URL);
  await page.getByRole('switch', { name: WEEK }).click();
  const options = page.getByRole('region', { name: 'Opciones de Certamen 1' });
  await options.getByLabel('Fecha de la prueba').fill(inDays(15));
  await expect(options.getByRole('status')).toContainText('Faltan 15 días');
  await expect(page.getByRole('table', { name: 'Submazos' })).toHaveCount(0);
  await expect(page.getByText('Repaso final')).toBeVisible();
  await expect(page.locator('[data-mastery]').first()).toBeVisible();
  await page
    .getByRole('button', { name: `Configuración de ${WEEK.replace('Activar ', '')}` })
    .click();
  await expect(page.getByRole('link', { name: 'Editar o crear configuraciones' })).toBeVisible();
});

test('on a small phone, in the dark too: nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page);
  await page.goto(ASSESSMENT_URL);
  await page.getByRole('switch', { name: WEEK }).click();
  await page.getByLabel('Fecha de la prueba').fill(inDays(12));
  await expect(page.getByText(/Faltan 12 días/).first()).toBeVisible();
  const sideways = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await sideways()).toBeLessThanOrEqual(0);
  await page.goto(COURSE_URL);
  await expect(page.getByText('Faltan 12 días · vas al día')).toBeVisible();
  expect(await sideways()).toBeLessThanOrEqual(0);
  await page.goto('/home');
  const summary = page.getByText('Certamen 1 · Faltan 12 días · vas al día');
  await expect(summary).toBeVisible();
  expect(await sideways()).toBeLessThanOrEqual(0);
  // It is read whole, not cut off beside the bar.
  expect(await summary.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
  await page.goto(`${ASSESSMENT_URL}/review`);
  await expect(page.getByText('Repaso final de Certamen 1')).toBeVisible();
  expect(await sideways()).toBeLessThanOrEqual(0);
});
