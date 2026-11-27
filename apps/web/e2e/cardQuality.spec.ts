// E2e tests of «Tarjetas» in the administration, with the demo's made-up figures: nothing moves loading it or
// changing the scope, the CSV is downloaded, and a student does not have it.
import { readFile } from 'node:fs/promises';
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/** The place of each of `selectors` in every frame, from the first one with the web fonts in. */
async function watchPlaces(page: Page, selectors: string[]) {
  await page.addInitScript((sels) => {
    const w = window as unknown as { places_: Record<string, string[]> };
    w.places_ = Object.fromEntries(sels.map((s) => [s, []]));
    const fontsIn = () =>
      ['Inter Variable', 'Source Serif 4 Variable'].every((family) =>
        [...document.fonts].some(
          (f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded',
        ),
      );
    let n = 0;
    const take = () => {
      for (const s of fontsIn() ? sels : []) {
        const b = document.querySelector(s)?.getBoundingClientRect();
        if (!b) continue;
        const where = [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round).join(',');
        if (!w.places_[s]!.includes(where)) w.places_[s]!.push(where);
      }
      if (++n < 600) requestAnimationFrame(take);
    };
    requestAnimationFrame(take);
  }, selectors);
}

const places = (page: Page) =>
  page.evaluate(() => (window as unknown as { places_: Record<string, string[]> }).places_);

const late = (page: Page, ms: number) =>
  page.route('**/api/admin/card-quality?**', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });

test('loading «Tarjetas» from nothing: the title, the choices and the summary in one place, the list after', async ({
  page,
}) => {
  test.slow();
  // The summary's place (its paragraph grows inside it when the text comes) and the line under it.
  const SUMMARY = 'main div:has(> div > p[aria-live])';
  const PLACES = ['main h2', 'main button[aria-label^="Ramo"]', SUMMARY, `${SUMMARY} + div`];
  await signIn(page);
  await watchPlaces(page, PLACES);
  await late(page, 900);
  await page.goto('/admin/cards');
  const list = page.getByRole('list', { name: 'Las más difíciles' });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  await expect(page.locator('main p[aria-live]')).toContainText('Calculado el');
  await page.waitForTimeout(800);
  const seen = await places(page);
  for (const s of PLACES) expect(seen[s], s).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test('narrowing to an assessment and a week, and the suspicious: the list changes, nothing above it moves', async ({
  page,
}) => {
  test.slow();
  await signIn(page);
  await page.goto('/admin/cards');
  await expect(
    page.getByRole('list', { name: 'Las más difíciles' }).getByRole('listitem').first(),
  ).toBeVisible();
  const place = (sel: string) =>
    page.locator(sel).evaluate((e) => {
      const b = e.getBoundingClientRect();
      return [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round);
    });
  const before = await place('main p[aria-live]');
  const asked: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname === '/api/admin/card-quality') asked.push(url.searchParams.get('deck') ?? '');
  });
  await late(page, 600);
  await page.getByRole('button', { name: 'Certamen: Todo el ramo' }).click();
  await page.getByRole('menuitemradio', { name: 'Certamen 1' }).click();
  await expect(page.locator('main p[aria-live]')).toContainText('Calculado el');
  await page.getByRole('button', { name: 'Semana o clase: Todo el certamen' }).click();
  await page.getByRole('menuitemradio').nth(1).click();
  await page.getByRole('button', { name: 'Lista: Las más difíciles' }).click();
  await page.getByRole('menuitemradio', { name: 'Las sospechosas' }).click();
  const suspicious = page.getByRole('list', { name: 'Las sospechosas' });
  await expect(suspicious.getByRole('listitem').first()).toBeVisible();
  expect(await place('main p[aria-live]')).toEqual(before);
  expect(asked).toHaveLength(2);
  const first = suspicious.getByRole('listitem').first();
  await expect(
    first.getByText(/Falla más|Respuesta en menos|Muchos la suspenden|Sanguijuela/).first(),
  ).toBeVisible();
  await first.getByRole('link', { name: /en el explorador de tarjetas/ }).click();
  await expect(page).toHaveURL(/\/anki\/.+\/cards\?card=/);
});

test('the CSV of the list: one row per card with its code, opened as Spanish by a spreadsheet', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/admin/cards');
  const items = page.getByRole('list', { name: 'Las más difíciles' }).getByRole('listitem');
  await expect(items.first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar la lista (CSV)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Las más difíciles - Anatomía I.csv');
  const text = await readFile(await file.path(), 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const lines = text.slice(1).trim().split('\r\n');
  expect(lines[0]).toMatch(/^Código;Versión;Mazo;Frente;Estudiantes;/);
  expect(lines.length - 1).toBe(await items.count());
  expect(text).not.toMatch(/@ug\.uchile\.cl|demo/);
});

test('a student does not have «Tarjetas» in the menu, nor opens it', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('qv-demo-role', 'student'));
  await signIn(page);
  await page.goto('/home');
  await expect(page.getByRole('link', { name: 'Tarjetas', exact: true })).toHaveCount(0);
  await page.goto('/admin/cards');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Esta página no aparece ni en el Netter' }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Las más difíciles' })).toHaveCount(0);
});
