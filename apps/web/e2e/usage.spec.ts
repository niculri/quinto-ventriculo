import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Step 2.9: «Uso» in the administration panel, with the demo's made-up figures. Entering it from another section and
 * loading it from nothing move nothing (layout shift 0 once the page is there, and the summary and the chart in one
 * place from their first frame, also when the figures come late); nothing is wider than the screen; a student does not
 * have it in the menu. The demo's user is an administrator; `qv-demo-role` = `student` makes it a student.
 */

/** Counts the layout shifts (CLS) from the start of the page; `settle()` marks from when they must be 0. */
async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { settledShift_: number; settledAt_: number };
    w.settledShift_ = 0;
    w.settledAt_ = Number.POSITIVE_INFINITY;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        startTime: number;
        hadRecentInput: boolean;
      }[]) {
        if (!e.hadRecentInput && e.startTime > w.settledAt_) w.settledShift_ += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (window as unknown as { settledAt_: number }).settledAt_ = performance.now();
            done();
          }),
        ),
      ),
  );
const settledShift = (page: Page) =>
  page.evaluate(() => (window as unknown as { settledShift_: number }).settledShift_);

const fontsLoaded = (page: Page) =>
  page.waitForFunction(() =>
    ['Inter Variable', 'Source Serif 4 Variable'].every((family) =>
      [...document.fonts].some(
        (f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded',
      ),
    ),
  );

/** Where an element is in the page (not in the screen: a click can scroll it). */
const placeOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((e) => {
    const b = e.getBoundingClientRect();
    return [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round);
  });

test('entering «Uso» from another section: the figures come and nothing moves', async ({
  page,
}) => {
  await watchShifts(page);
  await signIn(page);
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { level: 2, name: 'Reportes' })).toBeVisible();
  await fontsLoaded(page);
  // The figures come a while after the page (as from a far database).
  await page.route('**/api/admin/usage', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  const own = page.getByRole('navigation', { name: 'Secciones de la administración' });
  const menu = (await own.isVisible())
    ? own
    : page.getByRole('navigation', { name: 'Menú del sitio' });
  await menu.getByRole('link', { name: 'Uso', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/usage$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Uso' })).toBeVisible();
  // The page is there, without its figures yet: from here on, nothing may move.
  await expect(page.getByRole('heading', { name: 'Lo más usado en 30 días' })).toBeVisible();
  await settle(page);
  await expect(
    page
      .getByRole('row', { name: /Alumnos activos/ })
      .getByRole('cell')
      .first(),
  ).not.toBeEmpty();
  await expect(page.getByRole('table', { name: 'Mazos' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Lo más abierto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Activación' })).toBeVisible();
  await page.waitForTimeout(800);
  expect(await settledShift(page)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  // Nor is a table wider than its card (the card would cut its last figures without the page scrolling), also with
  // names as long as the real ones: the test content's are short, so they are made long here.
  expect(
    await page.locator('main table').evaluateAll((tables) => {
      for (const t of tables) {
        for (const th of t.querySelectorAll('tbody th[scope="row"]')) {
          const [name, detail] = th.querySelectorAll(':scope > span');
          if (name) name.textContent = 'Transcripción II: procesamiento y regulación del RNA';
          if (detail) detail.textContent = 'Biología celular y molecular, segundo semestre';
        }
      }
      return tables.filter((t) => t.scrollWidth > (t.parentElement?.clientWidth ?? 0) + 1).length;
    }),
  ).toBe(0);
});

test('loading «Uso» from nothing: the title, the summary and the chart in one place from their first frame', async ({
  page,
}) => {
  const PLACES = ['main h2', '#usage-summary + div', 'ol[aria-label]', '#usage-top'];
  await signIn(page);
  await page.addInitScript((sels) => {
    const w = window as unknown as {
      places_: Record<string, string[]>;
      figuresAtStart_?: boolean;
    };
    w.places_ = Object.fromEntries(sels.map((s) => [s, []]));
    // From the first frame with the two web fonts in (as e2e/contact.spec.ts): when Inter arrives after the first paint
    // (Fontsource, `font-display: swap`), the paragraph above the summary wraps again on the phone, and that is the whole
    // site's, not this page's (revisión de cero 2.9, segunda vuelta: 1 run in 16 moved the summary 20 px that way). The
    // figures come 800 ms later, so what they move is still measured.
    const fontsIn = () =>
      ['Inter Variable', 'Source Serif 4 Variable'].every((family) =>
        [...document.fonts].some(
          (f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded',
        ),
      );
    let n = 0;
    const take = () => {
      // Whether the first frame measured was still without the figures (the test must see them arrive).
      if (fontsIn() && w.figuresAtStart_ === undefined) {
        w.figuresAtStart_ = !!document
          .querySelector('#usage-summary + div tbody td')
          ?.textContent?.trim();
      }
      for (const s of fontsIn() ? sels : []) {
        const b = document.querySelector(s)?.getBoundingClientRect();
        if (!b) continue;
        const where = [b.x, b.y + window.scrollY].map(Math.round).join(',');
        if (!w.places_[s]!.includes(where)) w.places_[s]!.push(where);
      }
      if (++n < 600) requestAnimationFrame(take);
    };
    requestAnimationFrame(take);
  }, PLACES);
  await page.route('**/api/admin/usage', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.goto('/admin/usage');
  await expect(page.getByRole('table', { name: 'Mazos' })).toBeVisible();
  await page.waitForTimeout(1000);
  const places = await page.evaluate(
    () => (window as unknown as { places_: Record<string, string[]> }).places_,
  );
  for (const s of PLACES) expect(places[s], s).toHaveLength(1);
  expect(
    await page.evaluate(() => (window as unknown as { figuresAtStart_?: boolean }).figuresAtStart_),
  ).toBe(false);

  // Choosing the weeks changes the bars, not the page.
  const before = await placeOf(page, 'ol[aria-label]');
  await page.getByRole('button', { name: 'Periodo: Últimos 30 días' }).click();
  await page.getByRole('menuitemradio', { name: 'Últimas 12 semanas' }).click();
  const weeks = page.getByRole('list', { name: 'Alumnos activos, por semana' });
  await expect(weeks.getByRole('listitem')).toHaveCount(12);
  expect(await placeOf(page, 'ol[aria-label]')).toEqual(before);
});

test('a student does not have «Uso» in the menu, nor opens it', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('qv-demo-role', 'student'));
  await signIn(page);
  await page.goto('/home');
  await expect(page.getByRole('link', { name: 'Uso', exact: true })).toHaveCount(0);
  await page.goto('/admin/usage');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Esta página no aparece ni en el Netter' }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Alumnos activos/ })).toHaveCount(0);
});

test('what is opened: the home page and «Ponte a prueba» count nothing, a note once, and a search typed letter by letter once', async ({
  page,
}) => {
  const opens: unknown[] = [];
  const reads: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path === '/api/usage/open') opens.push(r.postDataJSON());
    else if (/^\/api\/(decks|quizzes|search)/.test(path)) reads.push(path);
  });
  await signIn(page);
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: /^Hola/ })).toBeVisible();
  await page.waitForTimeout(1200);
  // «Hoy» counts without the decks (step 3.2), and nothing was counted.
  expect(reads.some((p) => p.startsWith('/api/decks/'))).toBe(false);
  expect(opens).toEqual([]);

  await page.goto('/semesters/2/courses/biologia-celular/notes/11-traduccion');
  await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
  await page.waitForTimeout(1200);
  expect(opens).toEqual([{ kind: 'note', id: '11-traduccion' }]);

  // The palette, a letter at a time (slower than it waits): every text is asked for, one search counted.
  reads.length = 0;
  await page.keyboard.press('ControlOrMeta+k');
  const box = page.getByRole('combobox', { name: 'Buscar en la página' });
  await expect(box).toBeVisible();
  for (const letter of 'ribosom') {
    await box.press(letter);
    await page.waitForTimeout(300);
  }
  await expect(page.getByRole('option').first()).toBeVisible();
  expect(reads.filter((p) => p === '/api/search').length).toBeGreaterThan(1);
  await box.press('Enter');
  await page.waitForTimeout(800);
  expect(opens.filter((o) => (o as { kind: string }).kind === 'search')).toEqual([
    { kind: 'search', from: 'note' },
  ]);
});
