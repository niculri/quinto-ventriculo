// E2e tests of the phone, at 375 px (the narrowest iPhone in use): touch targets big enough, fields that do not make
// iOS zoom, studying on the whole screen and a note's index at hand.
import { writeFileSync } from 'node:fs';
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { DECK_URL, openModeRow, setAdminMode, signIn } from './helpers';
import { ACCEPTED_ACCOUNT, PORT } from './accepted';

test.skip(({ isMobile }) => !isMobile, 'phone only');
test.use({ viewport: { width: 375, height: 667 } });

const COURSE = '/semesters/1/courses/anatomia-1';
const BIOCEL = '/semesters/2/courses/biologia-celular';
const TEST_URL = `${BIOCEL}/tests/certamen-2/preguntas-de-practica`;

interface Target {
  name: string;
  primary: boolean;
  box: [number, number, number, number];
  hit: [number, number];
}

/**
 * Everything one can touch on screen, with its box and the size of what responds to a finger: its box grown by an
 * absolutely placed ::after (`after:-inset-2`). Links inside running text are left out, as WCAG 2.5.8 does.
 */
const TARGETS =
  'a[href], button, [role="button"], [role="switch"], [role="tab"], [role="radio"], [role="checkbox"], summary, input:not([type="hidden"]), select, textarea';

function targets(page: Page): Promise<Target[]> {
  return page.evaluate((selector) => {
    const px = (v: string) => (v.endsWith('px') ? Number.parseFloat(v) : 0);
    const out: Target[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.closest('[aria-hidden="true"], [inert], .sr-only')) continue;
      if ((el as HTMLButtonElement).disabled) continue;
      if (el.matches('input') && el.closest('label, [role="switch"]')) continue;
      if (el.matches('a') && el.closest('p, li p, .note-body, figcaption, td')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden') continue;
      const after = getComputedStyle(el, '::after');
      let [w, h] = [r.width, r.height];
      if (
        after.content !== 'none' &&
        after.position === 'absolute' &&
        style.position !== 'static'
      ) {
        w += -px(after.left) - px(after.right);
        h += -px(after.top) - px(after.bottom);
      }
      const name = (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 60);
      const primary =
        !!el.closest('[role="group"][aria-label="Responder"], [aria-label="Alternativas"]') ||
        name === 'Mostrar respuesta' ||
        el.matches('.bg-brand');
      out.push({
        name: `${el.tagName.toLowerCase()} «${name}»`,
        primary,
        box: [r.x, r.y + window.scrollY, r.width, r.height].map(Math.round) as Target['box'],
        hit: [Math.floor(w), Math.floor(h)],
      });
    }
    return out;
  }, TARGETS);
}

/**
 * Targets that lose part of what is drawn to a neighbor: a grown area (::after) painted over it takes the taps meant
 * for it. Probed near the corners and at the middle of each visible target.
 */
function stolen(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const out: string[] = [];
    const name = (e: Element) =>
      `${e.tagName.toLowerCase()} «${(e.getAttribute('aria-label') ?? e.textContent).trim().slice(0, 40)}»`;
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.closest('[aria-hidden="true"], [inert], .sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.top < 0 || r.bottom > innerHeight) continue;
      const points = [
        [r.left + 2, r.top + 2],
        [r.right - 2, r.top + 2],
        [r.left + 2, r.bottom - 2],
        [r.right - 2, r.bottom - 2],
        [r.left + r.width / 2, r.top + r.height / 2],
      ] as const;
      for (const [x, y] of points) {
        const other = document.elementFromPoint(x, y)?.closest(selector);
        if (other && other !== el && !el.contains(other) && !other.contains(el)) {
          out.push(`${name(el)} → ${name(other)}`);
          break;
        }
      }
    }
    return out;
  }, TARGETS);
}

const SCREENS: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'home', open: (p) => p.goto('/home').then(() => undefined) },
  { name: 'course', open: (p) => p.goto(COURSE).then(() => undefined) },
  { name: 'assessment', open: (p) => p.goto(`${COURSE}/anki/certamen-1`).then(() => undefined) },
  { name: 'note', open: (p) => p.goto(`${BIOCEL}/notes/11-traduccion`).then(() => undefined) },
  { name: 'cards', open: (p) => p.goto(`${COURSE}/anki/certamen-1/cards`).then(() => undefined) },
  { name: 'quiz cover', open: (p) => p.goto(`${TEST_URL}/pautas`).then(() => undefined) },
  {
    name: 'quiz question',
    open: async (p) => {
      await p.goto(`${TEST_URL}/pautas`);
      await p.getByRole('button', { name: 'Comenzar' }).click();
      await p.getByRole('list', { name: 'Alternativas' }).getByRole('button').first().click();
    },
  },
  {
    name: 'study',
    open: async (p) => {
      await p.goto(`${DECK_URL}/study`);
      await p.getByRole('button', { name: 'Mostrar respuesta' }).click();
    },
  },
];

async function settle(page: Page) {
  await expect(
    page.locator('h1, [role="region"][aria-label^="Reverso"], [aria-label="Pregunta"]').first(),
  ).toBeVisible();
  await expect(page.getByText(/^(Cargando|Preparando)/)).toHaveCount(0);
  await page.waitForLoadState('networkidle');
}

for (const screen of SCREENS) {
  test(`touch targets on the ${screen.name}: 44 px the main ones, 24 px the rest, none over another`, async ({
    page,
  }, info) => {
    await signIn(page);
    await screen.open(page);
    await settle(page);
    const found = await targets(page);
    expect(found.length).toBeGreaterThan(3);
    if (process.env.QV_DUMP_TARGETS) {
      writeFileSync(
        `${process.env.QV_DUMP_TARGETS}/${info.project.name}-${screen.name}.json`,
        JSON.stringify(found, null, 1),
      );
    }
    const small = found
      .filter((t) => t.hit[0] < (t.primary ? 44 : 24) || t.hit[1] < (t.primary ? 44 : 24))
      .map((t) => `${t.name}: ${t.hit.join(' × ')}${t.primary ? ' (principal)' : ''}`);
    expect(small).toEqual([]);
    expect(await stolen(page)).toEqual([]);
  });
}

/** Every field on screen, with its font size: under 16 px, iOS zooms the page into it. */
const smallFields = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input, textarea, select')]
      .filter(
        (el) =>
          !['checkbox', 'radio', 'range', 'hidden', 'color'].includes(
            (el as HTMLInputElement).type,
          ),
      )
      .map((el) => ({
        name: el.getAttribute('aria-label') ?? el.id,
        size: Number.parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((f) => f.size < 16)
      .map((f) => `${f.name}: ${f.size}px`),
  );

/**
 * Fields whose height the 16 px rule changes (it keeps the line of the small text): under one, the page would move.
 * The rule is taken out for a moment and each field measured again.
 */
const grownFields = (page: Page) =>
  page.evaluate(() => {
    const fields = [...document.querySelectorAll<HTMLElement>('input, textarea, select')].filter(
      (el) => el.getBoundingClientRect().height > 0,
    );
    const heights = () => fields.map((el) => el.getBoundingClientRect().height);
    const before = heights();
    const rules: { sheet: CSSStyleSheet; index: number; text: string }[] = [];
    for (const sheet of document.styleSheets) {
      [...sheet.cssRules].forEach((rule, index) => {
        if (
          rule instanceof CSSMediaRule &&
          /textarea[^{]*\{\s*font-size: 16px/.test(rule.cssText)
        ) {
          rules.push({ sheet, index, text: rule.cssText });
        }
      });
    }
    if (!rules.length) return ['the 16 px rule is not there'];
    for (const r of [...rules].reverse()) r.sheet.deleteRule(r.index);
    const after = heights();
    for (const r of rules) r.sheet.insertRule(r.text, r.index);
    return fields.flatMap((el, i) =>
      Math.abs(before[i]! - after[i]!) > 0.5
        ? [
            `${el.getAttribute('aria-label') ?? el.id}: ${String(after[i])} → ${String(before[i])} px`,
          ]
        : [],
    );
  });

test('every field has 16 px text, so iOS does not zoom in when it is focused, and none grows', async ({
  page,
}) => {
  await signIn(page);
  const seen = new Set<string>();
  const check = async (where: string) => {
    const count = await page.locator('input, textarea, select').count();
    if (count) seen.add(where);
    expect(await smallFields(page), where).toEqual([]);
    if (count) expect(await grownFields(page), where).toEqual([]);
  };
  await page.goto(`${COURSE}/anki/certamen-1`);
  await settle(page);
  await check('certamen');
  await page.goto(`${COURSE}/anki/certamen-1/cards`);
  await settle(page);
  await check('tarjetas');
  await page.goto('/settings/anki');
  await settle(page);
  await check('opciones');
  await page.goto('/settings/deck-options');
  await settle(page);
  await check('configuración de mazos');
  await page.getByRole('button', { name: /Buscar en la página/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('buscador');
  await page.keyboard.press('Escape');
  await page.goto(`${DECK_URL}/study`);
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('menuitem', { name: 'Reportar error' }).click();
  await expect(page.getByRole('dialog', { name: /Reportar/ })).toBeVisible();
  await check('reportar');
  expect(seen.size).toBeGreaterThanOrEqual(5);
});

async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { shift_: number };
    w.shift_ = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!e.hadRecentInput) w.shift_ += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const shifts = (page: Page) =>
  page.evaluate(() => (window as unknown as { shift_: number }).shift_);
/** Counts from here on: how the pages arrive on a loaded machine is not what a test about a gesture looks at. */
const forgetShifts = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { shift_: number }).shift_ = 0;
  });

test('studying takes the whole screen: no top bar, the answers at the bottom, nothing moves', async ({
  page,
  browserName,
}) => {
  if (browserName === 'chromium') await watchShifts(page);
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  const front = page.getByRole('region', { name: 'Frente de la tarjeta' });
  await expect(front).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();
  const back = (await page.getByRole('link', { name: /^Volver a/ }).boundingBox())!;
  expect(back.y).toBeLessThan(20);
  const reveal = (await page.getByRole('button', { name: 'Mostrar respuesta' }).boundingBox())!;
  expect(667 - (reveal.y + reveal.height)).toBeLessThan(24);
  const card = (await front.boundingBox())!;
  expect(card.height).toBeGreaterThan(667 - 64 - 120);

  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Bien/ })
    .click();
  await expect(page.getByRole('region', { name: 'Frente de la tarjeta' })).toBeVisible();
  if (browserName === 'chromium') expect(await shifts(page)).toBe(0);
  await page.getByRole('link', { name: /^Volver a/ }).click();
  await expect(page.getByRole('banner')).toBeVisible();
});

test.describe('the simple mode', () => {
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [
            {
              name: 'qv-demo-study',
              value: JSON.stringify({
                preferences: { fullAnki: false, welcomeSeen: true },
                activations: [{ deckId: '1006809718735317183', active: true }],
              }),
            },
            ACCEPTED_ACCOUNT,
          ],
        },
      ],
    },
  });

  test('nothing under the answers takes room from the card: the material is in «Más»', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${DECK_URL}/study`);
    const reveal = page.getByRole('button', { name: 'Mostrar respuesta' });
    const box = (await reveal.boundingBox())!;
    expect(667 - (box.y + box.height)).toBeLessThan(24);
    await reveal.click();
    const answers = (await page.getByRole('group', { name: 'Responder' }).boundingBox())!;
    expect(667 - (answers.y + answers.height)).toBeLessThan(12);
    await page.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByRole('menuitem', { name: /^Saltar por hoy/ })).toBeVisible();
  });
});

test('a long note: the index is always at hand, takes to the section below its bar and closes', async ({
  page,
  browserName,
}) => {
  if (browserName === 'chromium') await watchShifts(page);
  await signIn(page);
  await page.goto(`${BIOCEL}/notes/11-traduccion`);
  await settle(page);
  // The path comes with the catalog, and on a loaded machine after the text: it pushes the article down 24 px.
  await expect(page.getByRole('main').getByRole('navigation', { name: 'Ruta' })).toContainText(
    'Biología celular',
  );
  if (browserName === 'chromium') await forgetShifts(page);
  const bar = page.getByRole('button', { name: 'Índice', exact: true });
  await page.getByRole('heading', { level: 2, name: 'Resumen' }).scrollIntoViewIfNeeded();
  await expect(bar).toBeInViewport();
  await bar.click();
  const panel = page.locator('#toc-panel');
  await panel.getByRole('link', { name: '2. Elongación' }).click();
  await expect(panel).toHaveCount(0);
  await expect(bar).toContainText('2. Elongación');
  const heading = (await page
    .getByRole('heading', { level: 2, name: '2. Elongación' })
    .boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  expect(heading.y).toBeGreaterThanOrEqual(barBox.y + barBox.height);
  expect(heading.y).toBeLessThan(667 / 2);
  if (browserName === 'chromium') expect(await shifts(page)).toBe(0);
});

test('the admin mode row is in the account menu on the phone: it fits, has its name and the mode shows elsewhere', async ({
  page,
}) => {
  await signIn(page);
  expect(await page.getByRole('switch', { name: 'Modo admin' }).count()).toBe(0);
  const account = page.getByRole('button', { name: /tu cuenta$/i });
  const bar = (await page.getByRole('banner').boundingBox())!;
  const accountBox = (await account.boundingBox())!;
  expect(accountBox.x + accountBox.width).toBeLessThanOrEqual(375);
  expect(accountBox.y).toBeGreaterThanOrEqual(bar.y);

  const row = await openModeRow(page);
  const box = (await row.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.height).toBeGreaterThanOrEqual(36);
  await expect(row).toHaveAttribute('aria-checked', 'false');
  // Keyboard: the row is the control.
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(row).toBeHidden();
  await expect(page.locator('[data-admin-mode-mark]')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Modo admin: ves el borrador' }),
  ).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await setAdminMode(page, false);
  await expect(page.locator('[data-admin-mode-mark]')).toHaveCount(0);
});
