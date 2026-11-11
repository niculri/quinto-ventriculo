import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

/**
 * Step 3.3: the cards of an assessment (`…/anki/certamen-1/cards`) with the test content (7 notes, 16 cards), and with
 * the demo's made-up cards (`qv-demo-cards`) for the measures of a large one. The list, its filters, the viewer and
 * «Practicar estas», on the computer and the phone, light and dark; nothing moves while it loads or while filtering.
 */

const PAGE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards';

/** The study saved in this browser by the demo (cards' states and log). */
const saved = (page: Page) =>
  page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('qv-demo-study') ?? '{}') as {
      cards?: unknown[];
      log?: unknown[];
    };
    return { cards: JSON.stringify(d.cards ?? []), log: (d.log ?? []).length };
  });

const count = (page: Page) => page.getByText(/^\d[\d.]* notas? · \d[\d.]* tarjetas?$/);

/** The filters: in the right column on a wide screen, in a panel on the phone. */
async function filters(page: Page, isMobile: boolean) {
  if (!isMobile) return page.getByRole('complementary', { name: 'Filtros' });
  await page.getByRole('button', { name: 'Filtros' }).click();
  return page.getByRole('dialog', { name: 'Filtros' });
}
async function closeFilters(page: Page, isMobile: boolean) {
  if (isMobile) await page.keyboard.press('Escape');
}

test('the list, a filter, the viewer with its actions and «Practicar estas»', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await page.goto(PAGE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tarjetas de Certamen 1' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText(
    /Certamen 1.*Anki.*Tarjetas/,
  );
  await expect(count(page)).toHaveText('7 notas · 16 tarjetas');
  await expect(
    page.getByRole('heading', { level: 2, name: /S1 - Semana de prueba › Mazo de prueba/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: /Imágenes/ })).toBeVisible();

  // A row opens the card as it is studied: front, Espacio, back, → the next one.
  await page.getByRole('button', { name: /^La columna tiene 7 vértebras/ }).click();
  const viewer = page.getByRole('dialog', { name: /T-PR-01-003\.1 · hueco 1/ });
  await expect(
    viewer.getByRole('region', { name: 'Frente de la tarjeta' }).locator('.cloze').first(),
  ).toHaveText('[...]');
  await page.keyboard.press('Space');
  await expect(
    viewer.getByRole('region', { name: 'Reverso de la tarjeta' }).locator('.cloze').first(),
  ).toHaveText('7');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: /T-PR-01-003\.1 · hueco 2/ })).toBeVisible();
  // Marked from the viewer: it stays when it is closed.
  const actions = page.getByRole('toolbar', { name: 'Acciones de la tarjeta' });
  await actions.getByRole('button', { name: 'Marcar' }).click();
  await expect(actions.getByRole('button', { name: 'Quitar la marca' })).toBeVisible();
  await actions.getByRole('button', { name: 'Historial' }).click();
  await expect(page.getByRole('dialog', { name: 'Historial de la tarjeta' })).toContainText(
    'Todavía no la has estudiado.',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/card=/);

  // «Marcadas»: that note; the others with 0 cannot be chosen.
  let panel = await filters(page, isMobile);
  await expect(panel.getByRole('radio', { name: /^Me cuestan/ })).toBeDisabled();
  await panel.getByRole('radio', { name: /^Marcadas/ }).click();
  await closeFilters(page, isMobile);
  await expect(page).toHaveURL(/state=marked/);
  await expect(count(page)).toHaveText('1 nota · 1 tarjeta');

  // «Practicar estas»: a round with it, without changing its state nor the log.
  const before = await saved(page);
  await page.getByRole('link', { name: 'Practicar estas' }).click();
  await expect(page).toHaveURL(/\/cards\/practice\?state=marked$/);
  await expect(
    page.getByText(/^(Practicar · quedan|Quedan) 1$/).filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/^(Practicar · quedan|Quedan) 1$/).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Bien/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Terminaste la práctica' })).toBeVisible();
  expect(await saved(page)).toEqual(before);
  // It counted as practice for the day.
  const practice = await page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('qv-demo-study') ?? '{}') as { practice?: { n: number }[] })
        .practice ?? [],
  );
  expect(practice.reduce((t, p) => t + p.n, 0)).toBe(1);
  await page.getByRole('link', { name: 'Volver a las tarjetas' }).click();
  await expect(page).toHaveURL(/\/cards\?state=marked$/);

  // «Ocultar respuestas»: remembered in this browser.
  panel = await filters(page, isMobile);
  await panel
    .getByRole('radiogroup', { name: 'Estado' })
    .getByRole('radio', { name: /^Todas/ })
    .click();
  await panel.getByRole('switch', { name: 'Ocultar respuestas' }).check();
  await closeFilters(page, isMobile);
  await expect(
    page.getByRole('button', { name: /^¿Cuántas vértebras cervicales hay\? — 2/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: /^¿Cuántas vértebras cervicales hay\? — 2/ }),
  ).toBeVisible();
});

test('a pasted code opens its card; the old browser and a deck’s link go to these pages', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(PAGE);
  await page.getByRole('searchbox', { name: 'Buscar en estas tarjetas' }).fill('T-PR-01-002.1');
  await expect(page.getByRole('dialog', { name: /T-PR-01-002/ })).toBeVisible();
  await page.keyboard.press('Escape');
  // Without accents.
  await page
    .getByRole('searchbox', { name: 'Buscar en estas tarjetas' })
    .fill('vertebras toracicas');
  await expect(count(page)).toHaveText('1 nota · 3 tarjetas');

  const deckTerm = encodeURIComponent(
    '"deck:() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba::Mazo de prueba"',
  );
  await page.goto(`/anki/browse?q=${deckTerm}`);
  await expect(page).toHaveURL(`${PAGE}?unit=s1-semana-de-prueba%2Fmazo-de-prueba`);
  await page.goto(`${DECK_URL}/cards`);
  await expect(page).toHaveURL(`${PAGE}?unit=s1-semana-de-prueba%2Fmazo-de-prueba`);
  await page.goto('/semesters/1/courses/anatomia-1/anki/certamen-1');
  await page.getByRole('link', { name: 'Ver las tarjetas' }).click();
  await expect(page).toHaveURL(PAGE);
});

test('«Modo avanzado»: «Lista / Tabla»; the simple mode has no table nor syntax', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(PAGE);
  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Tabla' }).click();
  await expect(page.getByRole('grid', { name: 'Tarjetas' })).toBeVisible();
  await expect(page.getByText('16 tarjetas', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('qv-demo-study') ?? '{}') as {
      preferences: Record<string, unknown>;
    };
    d.preferences = { ...d.preferences, fullAnki: false };
    localStorage.setItem('qv-demo-study', JSON.stringify(d));
  });
  await page.reload();
  await expect(count(page)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Vista' })).toHaveCount(0);
  await expect(page.getByRole('grid')).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Buscar en estas tarjetas' })).toHaveAttribute(
    'placeholder',
    'Buscar por texto o código',
  );
});

test('a day of the heatmap: «Ver esas tarjetas» opens those answered, with the cell’s figures', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('qv-demo-heatmap', 'empty'));
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Bien/ })
    .click();
  await expect(page.getByRole('region', { name: 'Frente de la tarjeta' })).toContainText(
    'Pregunta sin extra ni pista',
  );
  await page.goto('/semesters/1/courses/anatomia-1');
  await page.getByRole('gridcell', { name: /\(hoy\)/ }).click();
  const day = page.getByRole('dialog');
  await expect(day).toContainText('1 respuesta');
  await day.getByRole('link', { name: 'Ver esas tarjetas' }).click();
  await expect(page).toHaveURL(/\/anki\/cards\?day=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole('status').filter({ hasText: 'respondiste' })).toContainText(
    'respondiste 1 tarjeta (1 respuesta)',
  );
  await expect(count(page)).toHaveText('1 nota · 1 tarjeta');
});

/** The layout shift inside the page (#content), as e2e/exam.spec.ts measures it, from the start of the page. */
async function watchShift(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { shift: number };
    w.shift = 0;
    type Rect = { x: number; y: number; width: number; height: number };
    const overlap = (a: Rect, b: Rect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    new PerformanceObserver((list) => {
      const view = window.innerWidth * window.innerHeight;
      const far = Math.max(window.innerWidth, window.innerHeight);
      for (const e of list.getEntries() as unknown as {
        hadRecentInput: boolean;
        sources: { node: Node | null; previousRect: Rect; currentRect: Rect }[];
      }[]) {
        if (e.hadRecentInput) continue;
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
}

/** Where the title, the controls and the count line are. */
const places = async (page: Page) => {
  const out: number[][] = [];
  for (const l of [
    page.getByRole('heading', { level: 1 }),
    page.getByRole('searchbox', { name: 'Buscar en estas tarjetas' }),
    page.getByRole('link', { name: 'Practicar estas' }),
  ]) {
    const b = (await l.boundingBox())!;
    out.push([b.x, b.y, b.width, b.height].map(Math.round));
  }
  return out;
};

for (const theme of ['light', 'dark'] as const) {
  test(`nothing moves while it loads nor while filtering (${theme})`, async ({
    page,
    isMobile,
  }) => {
    await page.addInitScript((t) => localStorage.setItem('qv-theme', t), theme);
    // Made-up cards, 800, and their thumbnails and indexes slow: the skeleton has the list's places.
    await page.addInitScript(() => localStorage.setItem('qv-demo-cards', '800'));
    await page.route('**/api/catalog', async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });
    await watchShift(page);
    await signIn(page);
    await page.goto(PAGE);
    await expect(count(page)).toHaveText(/^800 notas/);
    await page.waitForTimeout(500);
    const shift = await page.evaluate(() => (window as unknown as { shift: number }).shift);
    console.log(`[${test.info().project.name}, ${theme}] CLS al cargar: ${shift.toFixed(4)}`);
    expect(shift).toBeLessThan(0.02);
    const before = await places(page);
    const panel = await filters(page, isMobile);
    await panel.getByRole('radio', { name: /^Me cuestan/ }).click();
    const profe = panel.getByRole('switch', { name: 'Lo recalcó el profe' });
    await profe.click();
    await expect(profe).toBeChecked();
    await closeFilters(page, isMobile);
    await expect(page).toHaveURL(/origin=profe/);
    await expect(count(page)).not.toHaveText(/^800 notas/);
    expect(await places(page)).toEqual(before);
    // The page never scrolls sideways.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
}

test('8,000 notes: how long a filter takes, on the computer and on a slow phone', async ({
  page,
  isMobile,
}, info) => {
  await page.addInitScript(() => localStorage.setItem('qv-demo-cards', '8000'));
  await signIn(page);
  if (isMobile) {
    // A mid-range phone: four times slower than this machine.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.goto(PAGE);
  await expect(count(page)).toHaveText(/^8\.000 notas/, { timeout: 30_000 });
  const panel = await filters(page, isMobile);
  const times: number[] = [];
  for (const label of ['Imagen', 'Texto', 'Todas']) {
    const radio = panel
      .getByRole('radiogroup', { name: 'Tipo' })
      .getByRole('radio', { name: new RegExp(`^${label}`) });
    const before = await count(page).textContent();
    const ms = await radio.evaluate(async (el, previous) => {
      const start = performance.now();
      (el as HTMLElement).click();
      await new Promise<void>((done) => {
        const check = () => {
          const now = [...document.querySelectorAll('[aria-live="polite"]')]
            .map((e) => e.textContent)
            .join();
          if (!now.includes(previous ?? '')) done();
          else requestAnimationFrame(check);
        };
        check();
      });
      return performance.now() - start;
    }, before);
    times.push(Math.round(ms));
  }
  await info.attach('filter-ms', { body: JSON.stringify(times), contentType: 'application/json' });
  console.log(`[${info.project.name}] filtrar 8.000 notas (ms): ${times.join(', ')}`);
  // From the click to the new count painted (the list's work and React's), not only the filter.
  expect(Math.max(...times)).toBeLessThan(isMobile ? 1500 : 500);
});
