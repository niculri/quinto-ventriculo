import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CONTACT_EMAIL } from '@qv/schema';
import { DECK_URL, signIn } from './helpers';

/**
 * Step 2.7 (EXP-P1 and EXP-P3): the footer of every page (the site, the legal texts and the source code), at least
 * 44 px tall on the phone and hidden while studying, and /about: public, without material, and still while it loads.
 */

const SOURCE = 'https://github.com/niculri/quinto-ventriculo';
/** The synthetic practice test (e2e/quiz.spec.ts): «Pautas de prueba» has 3 questions. */
const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';
const fitsTheWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** The footer's links, with where they go. */
async function footerLinks(page: Page) {
  return page
    .getByRole('contentinfo')
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => [a.textContent, a.getAttribute('href')]));
}

/** The layout shift once the web fonts are in (as e2e/contact.spec.ts measures it), and all of it. */
async function loadAndMeasureShift(page: Page, url: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { shift: number; settledShift: number; settledAt: number };
    w.shift = 0;
    w.settledShift = 0;
    w.settledAt = Number.POSITIVE_INFINITY;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        startTime: number;
        hadRecentInput: boolean;
      }[]) {
        if (e.hadRecentInput) continue;
        w.shift += e.value;
        if (e.startTime > w.settledAt) w.settledShift += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url);
  await page.waitForFunction(() =>
    ['Inter Variable', 'Source Serif 4 Variable'].every((family) =>
      [...document.fonts].some(
        (f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded',
      ),
    ),
  );
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (window as unknown as { settledAt: number }).settledAt = performance.now();
            done();
          }),
        ),
      ),
  );
  // A moment for anything late (a lazy chunk, the picture) to arrive and, if it moved something, to be counted.
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const w = window as unknown as { shift: number; settledShift: number };
    return { shift: w.shift, settledShift: w.settledShift };
  });
}

test.describe('without a session', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/about: what it is, who makes it, how it is reviewed and the thanks; nothing moves and no material', async ({
    page,
  }) => {
    const asked: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) asked.push(r.url());
    });
    const { shift, settledShift } = await loadAndMeasureShift(page, '/about');
    await expect(page.getByRole('heading', { level: 1, name: 'Acerca de' })).toBeVisible();
    const main = page.getByRole('main');
    await expect(main).toContainText('Nico Ulriksen');
    await expect(main).toContainText('Creador y desarrollador');
    await expect(main).toContainText('inteligencia artificial');
    await expect(page.getByRole('heading', { level: 2, name: 'Agradecimientos' })).toBeVisible();
    // The picture's square is there from the first paint (in the demo, with the initials).
    const box = await page.getByTestId('creator-picture').boundingBox();
    expect([box?.width, box?.height]).toEqual([96, 96]);
    expect(settledShift).toBe(0);
    expect(shift).toBeLessThan(0.1);
    expect(await fitsTheWidth(page)).toBe(true);
    expect(asked).toEqual([]);
  });

  test('the landing page’s footer: about, report a problem and the legal texts, each answering without a session', async ({
    page,
  }) => {
    await page.goto('/');
    expect(await footerLinks(page)).toEqual([
      ['Acerca de', '/about'],
      ['Reportar un problema', `mailto:${CONTACT_EMAIL}`],
      ['Privacidad', '/privacy'],
      ['Términos de uso', '/terms'],
      ['Licencias', '/licenses'],
      ['Código fuente', SOURCE],
    ]);
    for (const [name, heading] of [
      ['Acerca de', 'Acerca de'],
      ['Privacidad', 'Política de privacidad'],
      ['Términos de uso', 'Términos de uso'],
      ['Licencias', 'Licencias'],
    ] as const) {
      await page.goto('/');
      await page.getByRole('contentinfo').getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      // The public pages carry the same footer, without help (it is behind the login).
      await expect(
        page.getByRole('contentinfo').getByRole('link', { name: 'Acerca de' }),
      ).toBeVisible();
      await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Ayuda' })).toHaveCount(
        0,
      );
    }
  });
});

test('with a session, the footer adds help, every link answers, and on the phone each is at least 44 px tall', async ({
  page,
}, info) => {
  await signIn(page);
  expect(await footerLinks(page)).toEqual([
    ['Ayuda', '/help'],
    ['Acerca de', '/about'],
    ['Reportar un problema', `mailto:${CONTACT_EMAIL}`],
    ['Privacidad', '/privacy'],
    ['Términos de uso', '/terms'],
    ['Licencias', '/licenses'],
    ['Código fuente', SOURCE],
  ]);
  if (info.project.name === 'phone') {
    for (const link of await page.getByRole('contentinfo').getByRole('link').all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByRole('contentinfo').getByRole('link', { name: 'Ayuda' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await fitsTheWidth(page)).toBe(true);
});

test('studying a deck hides the footer', async ({ page }) => {
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  await expect(page.getByRole('button', { name: /Mostrar respuesta/ })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeHidden();
});

test('answering a test’s questions hides the footer; its cover and its results keep it', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  const footer = page.getByRole('contentinfo');
  await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible();
  await expect(footer).toBeVisible();

  await page.getByRole('button', { name: 'Comenzar' }).click();
  const alternatives = page.getByRole('list', { name: 'Alternativas' });
  for (let i = 0; i < 3; i++) {
    await expect(alternatives).toBeVisible();
    await expect(footer).toBeHidden();
    await alternatives.getByRole('button').first().click();
    const next = page.getByRole('button', { name: /^(Siguiente|Ver resultado)$/ });
    await next.click();
  }
  await expect(page.getByRole('button', { name: 'Repetir solo las malas' })).toBeVisible();
  await expect(footer).toBeVisible();
});
